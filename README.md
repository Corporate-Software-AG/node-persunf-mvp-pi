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


sudo raspi-config

-> Display Options -> Screen Blanking -> No


cp _env.conf env.conf

nano env.conf



mkdir ~/logs

touch ~/logs/servicestart.log

touch ~/logs/error.log



sudo apt install nodejs

sudo apt install libqmi-utils

sudo apt install udhcpc



npm install

(node index.js)

sudo reboot
