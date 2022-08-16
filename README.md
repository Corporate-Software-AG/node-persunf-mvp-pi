# node-persunf-mvp-pi

sudo su
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
cp qrservice.service /lib/systemd/system/qrservice.service
chmod 644 /lib/systemd/system/qrservice.service
systemctl daemon-reload
systemctl enable qrservice.service
echo "disable_touchscreen=1" >> /boot/config.txt
exit

sudo apt-get install unclutter
echo "@unclutter -idle 0" >> ~/.config/lxsession/LXDE-pi/autostart

sudo apt install nodejs
npm install
node index.js
