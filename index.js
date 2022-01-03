require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const https = require('https');
const e = require('express');

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

const DiscordLinkSchema = new Schema({
    discordId: String,
    wallet: String
});

const WhitelistSeries1 = mongoose.model('Whitelist', WhitelistSchema);
const AirdropsSeries1 = mongoose.model('AirdropS1', WhitelistSchema);
const BWDiscordLink = mongoose.model('BitwhipsDiscordLink', DiscordLinkSchema);

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

//Check if discord link already exists
async function checkDiscordLink(discordId,wallet=null) {
    ret = {exists: false, wallet: undefined}
    let dataRes = await BWDiscordLink.findOne({ discordId: discordId }).exec();
    if (wallet && dataRes === null) {
        dataRes = await BWDiscordLink.findOne({ wallet: wallet }).exec();
    }
    if (dataRes) {
        ret['exists'] = true;
        ret['wallet'] = dataRes.wallet;
    }
    return ret;
}


//Check if the wallet exists inside the whitelist
async function walletInWhitelist(wallet) {
    return (await WhitelistSeries1.findOne({ wallet: wallet }).exec()) !== null;
}

//Check if the wallet exists inside the airdrop
async function walletInAirdrop(wallet) {
    return (await AirdropsSeries1.findOne({ wallet: wallet }).exec()) !== null;
}

/**
 * Huh?
 * @param {mongoose.Model} model 
 */
async function getNumberInModel(model) {
    return await model.estimatedDocumentCount().exec();
}

app.get('/checkwhitelist', async (req, res) => {
    const { wallet, key } = req.query;
    if (checkingWhitelist) {
        if (await walletInWhitelist(wallet)) {
            //Exists in whitelist
            res.status(200).send();
        } else {
            res.status(404).send();
        }
    } else {
        res.status(200).send();
    }
});

app.get('/gets1whitelist', async (req, res) => {
    const { key } = req.query;
    if (key == currentKey) {
        WhitelistSeries1.find((err, doc) => {
            if (err) {
                res.status(500).send();
            } else {
                console.log(doc);
                res.json(doc.map((v, i) => v.wallet)).send();
                res.status(200).send();
            }
        });
    } else {
        res.status(401).send();
    }
});

app.get('/getlinks', async (req, res) => {
    const { key } = req.query;
    if (key == currentKey) {
        BWDiscordLink.find((err, doc) => {
            if (err) {
                res.status(500).send();
            } else {
                console.log(doc);
                res.json(doc.map((v, i) => v.wallet)).send();
                res.status(200).send();
            }
        });
    } else {
        res.status(401).send();
    }
});

app.get('/gets1airdrop', async (req, res) => {
    const { key } = req.query;
    if (key == currentKey) {
        AirdropsSeries1.find((err, doc) => {
            if (err) {
                res.status(500).send();
            } else {
                console.log(doc);
                res.json(doc.map((v, i) => v.wallet)).send();
                res.status(200).send();
            }
        });
    } else {
        res.status(401).send();
    }
});

//GET that checks if this wallet is already linked or not
app.get('/islinkedtodiscord', async (req, res) => {
    const { key, discordId } = req.query;
    if (key == currentKey) {
        res.json(await checkDiscordLink(discordId)).send();
    } else {
        res.status(401).send();
    }
});

//Post
app.post('/linkdiscord', async (req, res) => {
    const { discordId, wallet, key } = req.body;
    if (key == currentKey) {
        const checkRes = await checkDiscordLink(discordId,wallet);
        const jsonRes = { exists: false, wallet: undefined, created: false};
        if (checkRes.exists) {
            jsonRes['exists'] = true;
            jsonRes['wallet'] = checkRes['wallet'];
            res.json(jsonRes).send();
        } else {
            await BWDiscordLink.create({ discordId: discordId, wallet: wallet });
            jsonRes['wallet'] = wallet;
            jsonRes['created'] = true;
            res.json(jsonRes).send();
        }
    } else {
        res.status(401).send();
    }
});

app.post('/unlinkdiscord', async (req, res) => {
    const { key, discordId } = req.body;
    if (key == currentKey) {
        const dataRes = await BWDiscordLink.findOne({ discordId: discordId }).exec();
        if (dataRes) {
            await BWDiscordLink.deleteMany({discordId: discordId}).exec();
            res.status(200).send();
        } else {
            res.status(404).send();
        }
    } else {
        res.status(401).send();
    }
});



app.get('/checkairdrop', async (req, res) => {
    const { wallet, key } = req.query;
    if (checkingWhitelist) {
        if (await walletInAirdrop(wallet)) {
            //Exists in whitelist
            res.status(200).send();
        } else {
            res.status(404).send();
        }
    } else {
        res.status(200).send();
    }
});

app.get('/getstats', async (req, res) => {
    const { key } = req.query;
    if (key == currentKey) {
        try {
            const numWhitelists = (await getNumberInModel(WhitelistSeries1)) + (await getNumberInModel(BWDiscordLink));
            const numAirdrops = (await getNumberInModel(AirdropsSeries1)) + (await getNumberInModel(BWDiscordLink));
            res.json({ whitelists: numWhitelists, airdrops: numAirdrops }).send();
        } catch (e) {
            res.status(500).send();
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

app.post('/addtoairdrop', async (req, res) => {
    const { key, wallet, list } = req.body;
    if (key == currentKey) {
        if (wallet) {
            if (!(await walletInAirdrop(wallet))) {
                try {
                    await AirdropsSeries1.create({ wallet: wallet, series: 1 });
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