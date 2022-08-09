const express = require('express')
const app = express()
const port = process.env.PORT || 8080;
const path = require('path');
const Protocol = require('azure-iot-device-amqp').Amqp;
const Client = require('azure-iot-device').Client;

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use('/favicon.ico', express.static('favicon.ico'));

app.use(express.urlencoded({ extended: true }));

const connectionString = process.env.DEVICE_CONNECTION_STRING;

if (!connectionString) {
    console.log('Configuration incomplete! Set the DEVICE_CONNECTION_STRING environment variables.');
    process.exit(-1);
}

let deviceId = connectionString.split(";").filter((e) => e.startsWith("DeviceId="))[0].substring("DeviceId=".length);

let deviceConfig = {
    id: deviceId,
    location: "",
    verificationCode: ""
}



app.get('/', (req, res) => {
    state = { "complete": false }
    res.render("qr", { title: "POC QR", device: deviceConfig });
})

app.get('/status', (req, res) => {
    res.json(deviceConfig.verificationCode);
})

app.listen(port, async () => {
    console.log(`This app is listening at http://localhost:${port}`)
    let isConnected = !!await require('dns').promises.resolve('google.com').catch(() => { });
    console.log("Connected to Internet: ", isConnected)
})

let client = Client.fromConnectionString(connectionString, Protocol);
client.open((error) => {
    if (error) {
        console.error(error);
    } else {
        console.log('client successfully connected to iot hub');

        client.getTwin((error, twin) => {
            if (error) {
                console.error('could not get twin')
                process.exit(-1)
            } else {
                console.log('twin created');
                twin.on('properties.desired', (delta) => {
                    console.log('desired properties received:', JSON.stringify(delta));
                    deviceConfig.location = delta.mzr;
                    deviceConfig.verificationCode = delta.verificationCode
                });
            }
        })

        client.on('error', (error) => {
            console.error(error);
            process.exit(-1)
        });
    }
});


