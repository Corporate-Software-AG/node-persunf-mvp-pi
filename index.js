const express = require('express')
const app = express()
const port = process.env.PORT || 8080;
const path = require('path');
const short = require('short-uuid');

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use('/favicon.ico', express.static('favicon.ico'));

app.use(express.urlencoded());

app.get('/', (req, res) => {
    res.render("home", { title: "POC QR", uuid: short.generate() });
})

app.listen(port, () => {
    console.log(`This app is listening at http://localhost:${port}`)
})