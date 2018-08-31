echo "Removing potential old setups (this might cause errors that are safe to ignore, if no previous installation was found)"
systemctl stop parsermonitor
systemctl disable parsermonitor
rm /etc/systemd/system/parsermonitor.service
systemctl daemon-reload
systemctl reset-failed

echo "Writing unit-file..."
echo "[Unit]
Description=PDF Parser Monitor
Documentation=https://github.com/ViMaSter/parserloader

[Service]
ExecStart=/usr/local/bin/node $PWD/monitor.js
ExecReload=/bin/kill -HUP $MAINPID
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=parsermonitor
Restart=on-failure

[Install]
WantedBy=default.target
Alias=syslog.service" >> /etc/systemd/system/parsermonitor.service

echo "Enabling service..."
systemctl enable parsermonitor
systemctl start parsermonitor
echo "DONE!"