# HowToBeAHero Parser Loader

This package will set up a service that will clone the [HowToBeAHero-WikiToPdf](https://github.com/Setup007/HowToBeAHero-WikiToPdf) repository and set up an instance of it every time a branch is updated.
Running multiple instances is supported and every branch will automatically have a differnt port associated with it.

## Setup

1. Open a command line inside the root of this repository
2. Run `npm install`
3. Run `sudo sh ./installservice.sh`
4. Set up a **push-event only** [GitHub Webhook](https://developer.github.com/webhooks/) of the repository to use and point it at the `index.php` inside this repository.
5. Modify `github_config.json` to
    1. Contain a whitelist of every branch you would like to build fron. If a branch is not listed here, it's push events are ignored
    2. Contain the `secret` set up in the GitHub Webhook
5. The build process should start, every time a push event-notification is sent from GitHub.

Ensure the system-user running the webserver that will handle the request to `index.php` can run `/bin/systemctl restart parsermonitor.service` without having to authorize interactively.  
I.e. modify your `/etc/sudoers`-file to contain the following line:
```
ALL ALL=NOPASSWD: /bin/systemctl restart parsermonitor.service
```

## Testing

If you want to manually set up instances, run the following command inside the root of your repository:
```
node ./updaterrepoinstance.js [GITHUB .GIT-LINK] [BRANCH HEAD] [COMMIT TO USE]

EXAMPLE:
node ./updaterrepoinstance.js https://github.com/Setup007/HowToBeAHero-WikiToPdf.git ref/heads/develop 3b7738139ff753bcde
```

Alternatively, modify the `service_config.json` to contain the branches and commits you'd like to use and run `/bin/systemctl restart parsermonitor.service`. For example: 
```
{
    "ref/heads/develop": 3b7738139ff753bcde,
    "ref/heads/master": 6ee0242cbed442ec49,
}
```