import lexint from 'lexicographic-integer-encoding'
import { publicServerDb, publicDbs, loadExternalDb } from '../db/index.js'
import { constructUserUrl, parseEntryUrl } from '../lib/strings.js'
import { fetchUserId } from '../lib/network.js'

const lexintEncoder = lexint('hex')

export async function dbGet (dbUrl, opts = undefined) {
  const urlp = new URL(dbUrl)
  const origin = `hyper://${urlp.hostname}/`
  let userId = await fetchUserId(origin)
  let db = userId ? publicDbs.get(userId) : undefined
  if (!db) {
    if (!opts.userId) {
      throw new Error(`Unable to load ${dbUrl}, user ID not known`)
    }
    if (opts?.noLoadExternal) {
      throw new Error(`Database "${userId}" not found`)
    }
    db = await loadExternalDb(opts.userId)
    if (!db) {
      throw new Error(`Database "${opts.userId}" not found`)
    }
  }
  const pathParts = urlp.pathname.split('/').filter(Boolean)
  let bee = db.bee
  for (let i = 0; i < pathParts.length - 1; i++) {
    bee = bee.sub(decodeURIComponent(pathParts[i]))
  }
  return {
    db,
    entry: await bee.get(decodeURIComponent(pathParts[pathParts.length - 1]))
  }
}

export async function blobGet (dbId, blobName, opts = undefined) {
  if (typeof opts === 'string') {
    opts = {encoding: opts}
  }
  if (!blobName) throw new Error('Must specify a blob name')
  dbId = await fetchUserId(dbId)
  let db = publicDbs.get(dbId)
  if (!db) {
    if (opts?.noLoadExternal) {
      throw new Error(`Database "${dbId}" not found`)
    }
    db = await loadExternalDb(dbId)
  }
  return db.blobs.get(blobName, opts?.encoding)
}

export async function fetchAuthor (authorId, cache = undefined) {
  if (cache && cache[authorId]) {
    return cache[authorId]
  } else {
    let publicDb = publicDbs.get(authorId)
    let profileEntry
    if (publicDb) profileEntry = await publicDb.profile.get('self')
    let author = {
      url: constructUserUrl(authorId),
      userId: authorId,
      displayName: profileEntry?.value?.displayName || authorId
    }
    if (cache) cache[authorId] = author
    return author
  }
}

export async function fetchIndexedFollowerIds (subjectUserId) {
  const followsIdxEntry = await publicServerDb.followsIdx.get(subjectUserId)
  return followsIdxEntry?.value?.followerIds || []
}

export async function fetchReactions (subject) {
  const reactionsIdxEntry = await publicServerDb.reactionsIdx.get(subject.url)

  // go from {reaction: [urls]} to [reaction,[userIds]]
  let reactionsIdsPairs
  if (reactionsIdxEntry?.value?.reactions) {
    reactionsIdsPairs = await Promise.all(
      Object.entries(reactionsIdxEntry.value.reactions).map(async ([reaction, urls]) => {
        return [
          reaction,
          (await Promise.all(urls.map(fetchUserId))).filter(Boolean)
        ]
      })
    )
  }

  return {
    subject: reactionsIdxEntry?.value?.subject || {dbUrl: subject.url},
    reactions: reactionsIdsPairs ? Object.fromEntries(reactionsIdsPairs) : {}
  }
}

export async function fetchReplies (subject) {
  const threadIdxEntry = await publicServerDb.threadIdx.get(subject.url)
  return threadIdxEntry?.value.items || []
}

export async function fetchReplyCount (subject) {
  const comments = await fetchReplies(subject)
  return comments.length
}

async function fetchNotificationsInner (userInfo, {lt, gt, after, before, limit} = {}) {
  let notificationEntries = []
  limit = Math.max(Math.min(limit || 20, 20), 1)

  const ltKey = lt ? lt : before ? lexintEncoder.encode(Number(new Date(before))) : undefined
  const gtKey = gt ? gt : after ? lexintEncoder.encode(Number(new Date(after))) : undefined

  notificationEntries = await publicServerDb.notificationsIdx.list({
    lt: ltKey ? `${userInfo.userId}:${ltKey}` : `${userInfo.userId}:\xff`,
    gt: gtKey ? `${userInfo.userId}:${gtKey}` : `${userInfo.userId}:\x00`,
    limit,
    reverse: true
  })
  return notificationEntries
}

export async function fetchNotications (userInfo, opts) {
  const notificationEntries = await fetchNotificationsInner(userInfo, opts)
  return (await Promise.all(notificationEntries.map(fetchNotification))).filter(Boolean)
}

export async function countNotications (userInfo, opts) {
  const notificationEntries = await fetchNotificationsInner(userInfo, opts)
  return notificationEntries.length
}

export function addPrefixToRangeOpts (prefix, opts) {
  opts = Object.assign({}, opts || {})
  if (opts.lt || opts.lte) {
    if (opts.lt) opts.lt = `${prefix}:${opts.lt}`
    if (opts.lte) opts.lte = `${prefix}:${opts.lte}`
  } else {
    opts.lt = `${prefix}:\xff`
  }
  if (opts.gt || opts.gte) {
    if (opts.gt) opts.gt = `${prefix}:${opts.gt}`
    if (opts.gte) opts.gte = `${prefix}:${opts.gte}`
  } else {
    opts.gt = `${prefix}:\x00`
  }
  return opts
}

async function fetchNotification (notificationEntry) {
  const itemUrlp = parseEntryUrl(notificationEntry.value.itemUrl)
  const userId = await fetchUserId(itemUrlp.origin).catch(e => undefined)
  if (!userId) return undefined
  const db = userId ? publicDbs.get(userId) : undefined
  let item
  if (db) {
    try {
      item = await db.getTable(itemUrlp.schemaId).get(itemUrlp.key)
    } catch (e) {}
  }
  return {
    key: notificationEntry.key.includes(':') ? notificationEntry.key.split(':')[1] : notificationEntry.key,
    itemUrl: notificationEntry.value.itemUrl,
    createdAt: notificationEntry.value.createdAt,
    blendedCreatedAt: item?.value?.createdAt
      ? (item.value.createdAt < notificationEntry.value.createdAt ? item.value.createdAt : notificationEntry.value.createdAt)
      : notificationEntry.value.createdAt,
    author: {
      userId,
      url: constructUserUrl(userId)
    },
    item: item?.value
  }
}
