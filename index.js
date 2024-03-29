const express = require('express');
const app = express()
const port = process.env.PORT || 8080;
const path = require('path');
const Protocol = require('azure-iot-device-amqp').Amqp;
const Client = require('azure-iot-device').Client;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');


app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use('/favicon.ico', express.static('favicon.ico'));

app.use(express.urlencoded({ extended: true }));

const connectionString = process.env.DEVICE_CONNECTION_STRING;
const pin = process.env.PIN;

if (!connectionString) {
    console.log('Configuration incomplete! Set the DEVICE_CONNECTION_STRING environment variables.');
    process.exit(-1);
}

if (!pin) {
    console.log('Configuration incomplete! Set the PIN environment variables.');
    process.exit(-1);
}

let deviceId = connectionString.split(";").filter((e) => e.startsWith("DeviceId="))[0].substring("DeviceId=".length);

let deviceConfig = {
    id: deviceId,
    location: "",
    verificationCode: "",
    displayRotation: "normal",
    strgName: "",
    webUrl: ""
}

app.get('/', (req, res) => {
    let isConnected = await isConnected();
    if (!isConnected) {
        res.render("error", { title: "ERROR", message: "Not Connected", device: deviceConfig })
    } else {
        console.log("----------------------------- REDO Cellular Setup " + new Date().toISOString() + " -----------------------------")
        await setupCellular()
        console.log("----------------------------- REDO Start IoT Hub Client " + new Date().toISOString() + " -----------------------------")
        await startIotHubClient();
    }
    if (deviceConfig.verificationCode == "") {
        res.render("loading", { title: "loading" });
    } else {
        res.render("qr", { title: "QR", device: deviceConfig });
    }
})

app.get('/verificationCode', (req, res) => {
    res.json(deviceConfig.verificationCode);
})

app.listen(port, async () => {
    console.log("----------------------------- START " + new Date().toISOString() + " -----------------------------")
    console.log(`This app is listening at http://localhost:${port}`)
    let isConnected = await isConnected();
    console.log("Connected to Internet: ", isConnected)
    if (!isConnected) {
        await setupCellular();
    }

    await startIotHubClient();
    console.log("----------------------------- SETUP COMPLETE " + new Date().toISOString() + " -----------------------------")
    await startFullScreenApp();
});

async function isConnected() {
    return !!await require('dns').promises.resolve('azure.com').catch(() => { });
}

async function setupCellular() {
    try {
        let commands = [
            "sudo qmicli -d /dev/cdc-wdm0 --dms-set-operating-mode='online'",
            'sudo ip link set wwan0 down',
            'echo Y | sudo tee /sys/class/net/wwan0/qmi/raw_ip',
            'sudo ip link set wwan0 up',
            'sudo qmicli --device=/dev/cdc-wdm0 --uim-verify-pin=PIN1,' + pin,
            'sudo qmicli --device=/dev/cdc-wdm0 --device-open-proxy --wds-start-network="ip-type=4,apn=gprs.swisscom.ch" --client-no-release-cid',
        ]
        await execCommands(commands);
        await execDHCPCommand('sudo udhcpc -i wwan0')
    } catch (e) {
        console.error(e);
        sleep(2000);
        console.log("Retry Cellular Setup")
        await setupCellular();
    }
}

async function execCommands(commands) {
    for (let com of commands) {
        try {
            console.log("Exec: " + com);
            await execCommand(com)
        } catch (e) {
            sleep(1000);
            console.log(e)
            console.log("Retry: " + com);
            await execCommand(com)
        }
    }
}

async function execCommand(com) {
    let { stdout, stderr } = await exec(com)
    if (stderr) {
        console.log("Error: ", stderr)
        throw stderr;
    } else {
        console.log("Successful: ", stdout)
        return stdout;
    }
}

async function execDHCPCommand(com) {
    let { stdout, stderr } = await exec(com)
    if (stderr) {
        console.log("Err. Log: ", stderr)
    } else {
        console.log("Successful: ", stdout)
    }
}

async function startIotHubClient() {
    let client = Client.fromConnectionString(connectionString, Protocol);
    client.open(async (error) => {
        if (error) {
            console.error(error);
        } else {
            console.log("----------------------------- CONNECTED TO IOT HUB " + new Date().toISOString() + " -----------------------------")

            client.getTwin((error, twin) => {
                if (error) {
                    console.error('could not get twin')
                } else {
                    console.log("----------------------------- TWIN CREATED " + new Date().toISOString() + " -----------------------------")
                    twin.on('properties.desired', (delta) => {
                        console.log('TWIN Properties:', JSON.stringify(delta));
                        if (delta.mzr) deviceConfig.location = delta.mzr;
                        if (delta.verificationCode) deviceConfig.verificationCode = delta.verificationCode;
                        if (delta.displayRotation) deviceConfig.displayRotation = delta.displayRotation;
                        if (delta.strgName) deviceConfig.strgName = delta.strgName;
                        if (delta.webUrl) deviceConfig.webUrl = delta.webUrl;
                    });
                    await rotateDisplay(deviceConfig.displayRotation);
                }
            })

            client.onDeviceMethod('onHealthCheck', (request, response) => {
                console.log("------ HEALTH CHECK " + new Date().toISOString() + " ----------------------------------------------------")
                response.send(200, { "result": true }, (err) => err ? console.log('response to onHealthCheck sent.') : console.error('Unable to send onHealthCheck response'));
            });

            client.onDeviceMethod('onUploadLogs', async (request, response) => {
                console.log('received a request for onUploadLogs');
                try {
                    await uploadLogs();
                    response.send(200, { "result": true }, (err) => err ? console.log('response to onUploadLogs sent.') : console.error('Unable to send onUploadLogs response'));
                } catch (e) {
                    response.send(200, { "result": false, "message": e.message }, (err) => err ? console.log('response to onUploadLogs sent.') : console.error('Unable to send onUploadLogs response'));
                }
            });

            client.onDeviceMethod('onCommand', async (request, response) => {
                console.log(`------ COMMAND: "${request.payload}" ${new Date().toISOString()} ------`)
                try {
                    let stout = await execCommand(request.payload);
                    response.send(200, { "result": true, "message": stout }, (err) => err ? console.log('response to onCommand sent.') : console.error('Unable to send onCommand response'));
                } catch (e) {
                    response.send(200, { "result": false, "message": e.message }, (err) => err ? console.log('response to onCommand sent.') : console.error('Unable to send onCommand response'));
                }
            });

            client.onDeviceMethod('onRepoUpdate', async (request, response) => {
                console.log(`------ REPO UPDATE ${new Date().toISOString()} ------`)
                try {
                    let stout = await execCommand('/usr/bin/git -C /home/armasuisse/node-persunf-mvp-pi reset --hard');
                    response.send(200, { "result": true, "message": stout }, (err) => err ? console.log('response to onRepoUpdate sent.') : console.error('Unable to send onRepoUpdate response'));
                } catch (e) {
                    response.send(200, { "result": false, "message": e.message }, (err) => err ? console.log('response to onRepoUpdate sent.') : console.error('Unable to send onRepoUpdate response'));
                }
            });

            client.on('error', (error) => {
                console.error(error);
            });
        }
    });
}

async function startFullScreenApp() {
    let commands = [
        'chromium-browser --kiosk http://localhost:8080 --no-sandbox'
    ]
    await execCommands(commands);
}

async function rotateDisplay(mode) {
    await execCommand('DISPLAY=unix:0.0 xrandr --output DSI-1 --rotate ' + mode);
}

async function uploadLogs() {
    let filePath = "/home/armasuisse/logs/servicestart.log";
    let errorFilePath = "/home/armasuisse/logs/error.log";
    let client = Client.fromConnectionString(connectionString, Protocol);
    await uploadLogFile(client, filePath, "-startup")
    await uploadLogFile(client, errorFilePath, "-error")
}

async function uploadLogFile(client, filePath, postfix) {
    try {
        fs.stat(filePath, async (err, fileStats) => {
            console.log("Upload file: ", filePath);
            if (err) {
                console.error('could not read file: ' + err.toString());
            } else {
                let fileStream = fs.createReadStream(filePath);
                await client.uploadToBlob(new Date().toISOString() + postfix + '.log', fileStream, fileStats.size, (err, result) => {
                    if (err) {
                        console.error('error uploading file: ' + err.constructor.name + ': ' + err.message);
                    } else {
                        console.log('Upload successful: ', filePath);
                    }
                    fileStream.destroy();
                });
            }
        });
    } catch (e) {
        console.log("Upload Log file " + filePath + " failed", e);
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
