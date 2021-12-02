require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const https = require('https');

mongoose.connect(
    `mongodb+srv://quellen:${process.env.mongopass}@cluster0.jxtal.mongodb.net/dojodb?retryWrites=true&w=majority`,
    { useNewUrlParser: true, useUnifiedTopology: true }
);

app.use(cors());
app.use(express.json());

const Schema = mongoose.Schema;
const ObjectID = Schema.ObjectId;

let currentKey = process.env.accessKey;
let checkingWhitelist = true;

const WhitelistSchema = new Schema({
    series: Number,
    wallet: String
});

const WhitelistSeries1 = mongoose.model('Whitelist', WhitelistSchema)

function validateWallet(wallet) {
    //In base58, there is no 0, O, l, or I in the wallet string.
    const walletRegex = /^[\w^0OIl]{44}$/g; //44-length string with only alphanumeric characters and not the above characters
    return walletRegex.test(wallet);
}

function sendMessageToDiscord(message) {
    const discordMsg = https.request(
        process.env.discordWebhook,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );
    discordMsg.write(
        JSON.stringify({
            username: 'Whitelisting Integration',
            avatar_url: '',
            content: message,
        })
    );
    discordMsg.end();
}


//Check if the wallet exists inside the whitelist
async function walletInWhitelist(wallet) {
    return (await WhitelistSeries1.findOne({ wallet: wallet }).exec()) !== null;
}

app.get('/ip',async (req,res) => {
    console.log(`Request from: ${req.ip}`);
    res.send('Ok!');
});

app.get('/checkwhitelist', async (req, res) => {
    const { wallet, key } = req.query;
    if (key == currentKey) {
        if (checkingWhitelist) {
            if (await walletInWhitelist(wallet)) {
                res.status(200).send();
            } else {
                res.status(404).send();
            }
        } else {
            res.status(200).send();
        }
    } else {
        res.status(401).send();
    }
});

app.post('/rollkey', async (req, res) => {
    const { key, newKey } = req.body;
    if (key == currentKey) {
        currentKey = newKey;
    }
 });

app.post('/addtowhitelist', async (req, res) => {
    const { key, wallet, list } = req.body;
    if (key == currentKey) {
        if (wallet) {
            if (!(await walletInWhitelist(wallet))) {
                try {
                    await WhitelistSeries1.create({ wallet: wallet, series: 1 });
                    res.status(200).send();
                } catch (e) {
                    res.status(500).send();
                }
            } else {
                res.status(409).send();
            }
        }
    } else {
        res.status(401).send();
    }
});

app.listen(process.env.PORT || 3002, () => console.log('Listening...'));