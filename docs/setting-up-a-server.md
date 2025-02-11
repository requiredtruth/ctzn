# How to set up a CTZN server

This guide will assume you're starting from scratch, using Google Cloud, and using a Debian-variant distro.

## Step 1 - Create VM

Create a new VM instance. Recommended settings:

- OS: Debian or Ubuntu
- RAM: At least 4GB
- Disk: At least 10GB

Required settings:

- Firewall: Allow HTTP and HTTPS traffic

## Step 2 - Setup VM

Once the VM is active:

- [Install NVM](https://nvm.sh) and then install Node 14 or higher.
- Install nginx `sudo apt-get install nginx`
- Install CTZN `npm install -g ctzn`
- Install PM2 `npm install -g pm2`

## Step 4 - Setup your DNS record

Point your domain name's A record to the server. We'll refer to that domain as `$DOMAIN` from here on out.

## Step 5 - Enable gcloud's PTR record

**Note: CTZN requires a PTR record so if you're using a different platform (server host) than Google Cloud, you WILL need to solve this.**

From the Compute Engine dashboard, follow these steps:

- Click on the VM.
- Click "Edit" in the header.
- Scroll down to the "Network interfaces" section. You should have one entry which says "nic0: default" or similar.
- Click the edit-pen on the network interface.
- Toggle the "Public DNS PTR Record" setting to "Enabled."
- Enter your domain name (`$DOMAIN`) as the value.
- Click "Done".
- Click "Save" at the bottom of the page.

GCloud may give you an error saying you need to verify ownership of the domain before enabling the PTR record. Follow the steps they provide (it's fairly intuitive) and then complete these steps again.

You may verify the correctness of your PTR setup by running `nslookup $IP_ADDRESS`. It should point to the `$DOMAIN`.

## Step 6 - Start CTZN

Run `ctzn`. You will be presented with a terminal UI.

Hit `c` to configure your server. Set the domain, port, and any other settings needed. Hit `Escape` to exit the form and `Enter` to save changes.

Hit `s` to start the server.

## Step 7 - Create your Terms of Service and Privacy Policy documents

You will need to maintain a Terms of Service and Privacy Policy for your server. These will be presented to new users during signup.

These documents are saved in your config directory, which is `~/.ctzn` by default. The documents are:

- `~/.ctzn/terms-of-service.txt` The Terms of Service.
- `~/.ctzn/privacy-policy.txt` The Privacy Policy.

## Step 8 - Setup your certificate with LetsEncrypt

Follow these steps (again, we're assuming you're using Debian):

- Install snapd `sudo apt-get install snapd`
- Update snapd `sudo snap install core; sudo snap refresh core`
- Install certbot `sudo snap install --classic certbot`
- Setup your certbot exec path `sudo ln -s /snap/bin/certbot /usr/bin/certbot`
- Use certbot's setup process `sudo certbot --nginx`

## Step 9 - Configure the nginx reverse proxy

Start by opening the site config in your preferred editor:

```
sudo vim /etc/nginx/sites-enabled/default
```

Find the server config generated by certbot (it will say "# managed by Certbot") and locate this section:

```
location / {
  try_files $uri $uri/ =404;
}
```

Replace this with:

```
location / {
  proxy_pass http://127.0.0.1:3000;

  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Save and quit the editor, then run:

```
sudo service nginx reload
```

## Step 10 - Open your firewall rules (optional)

It's not clear whether this is needed, but you might want to create firewall rules which allow ingress and egress from UDP and TCP in the port ranges of 1024-65335.

## Done!

You should now see a CTZN welcome screen at your domain.
Your server is ready for people to use!
