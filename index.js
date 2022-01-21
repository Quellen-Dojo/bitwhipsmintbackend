require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const { https } = require('follow-redirects');
const { Connection } = require('@metaplex/js');
const { PublicKey, AccountInfo  } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');

mongoose.connect(
    `mongodb+srv://quellen:${process.env.mongopass}@cluster0.jxtal.mongodb.net/dojodb?retryWrites=true&w=majority`,
    { useNewUrlParser: true, useUnifiedTopology: true }
);

app.use(cors());
app.use(express.json());

const Schema = mongoose.Schema;
const ObjectID = Schema.ObjectId;

const rpcConn = new Connection(process.env.rpcEndpoint, 'confirmed');

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


/**
 * Verify that the metadata from a BitWhip actually belongs to BitWhips
 * @param {Metadata} metadata
 * @returns {boolean}
 */
function verifyMetadata(metadata) {
    const treasury = 'CCw23HjhwKxxwCKdV3QUQt4XYGcQNLJPCm9rek3wkcNo';
    const royalties = 'Ek4Q2tAt3vyhyN59G1EGUxRSZzYwnLSNDrYKF8AsLsNH';
    const candyMachineCreator = 'GXLsCeRw6Gz6o1zGewy951GgKnZHn7k4go6g9HmHjFvh';
    let valid = true;
    try {
        if (
            (metadata.data.data.creators[0]['address'] !== treasury &&
                metadata.data.data.creators[0]['address'] !== royalties &&
                metadata.data.data.creators[0]['address'] !== candyMachineCreator) ||
            (metadata.data.data.creators[1]['address'] !== treasury &&
                metadata.data.data.creators[1]['address'] !== royalties &&
                metadata.data.data.creators[1]['address'] !== candyMachineCreator) ||
            (metadata.data.data.creators[2] != undefined && (metadata.data.data.creators[2]['address'] !== treasury &&
                metadata.data.data.creators[2]['address'] !== royalties &&
                metadata.data.data.creators[2]['address'] !== candyMachineCreator))
        ) {
            valid = false;
        }
        if (metadata.data.updateAuthority !== treasury) {
            valid = false;
        }
    } catch {
        return false;
    }
    return valid;
}

function getAllMetadataFromArrayOfMints(mints) {
    return new Promise(async (resolve, reject) => {
        try {
            const BitWhips = [];
            for (hash of mints) {
                try {
                    const tokenMeta = await Metadata.load(rpcConn, await Metadata.getPDA(hash));
                    if (verifyMetadata(tokenMeta)) {
                        BitWhips.push(tokenMeta.data);
                    }
                } catch (e) {
                    // console.log(`Error in grabbing metadata for ${hash}: ${e}\nThis is most likely NOT a BitWhip, or even an NFT`);
                    continue;
                }
            }
            console.log(`Wallet has ${BitWhips.length} BitWhips`)
            resolve(BitWhips);
        } catch (e2) {
            console.log(`Error in grabbing all metadata: ${e2}`);
            reject(undefined);
        }
    });
}

/**
 * 
 * @param {Array} requestJson 
 * @param {string} httpMethod 
 * @param {string} rpcFunction 
 * @returns {Promise<object>}
 */
function sendJSONRPCRequest(requestJson,httpMethod,rpcFunction) {
    return new Promise((resolve, reject) => {
        const baseReq = { jsonrpc: '2.0', id: 1, method: rpcFunction, params: [...requestJson,{ encoding: 'jsonParsed' }] };
        const newReq = https.request(process.env.rpcEndpoint, { method: httpMethod, headers: { 'Content-Type': 'application/json' } }, (res) => {
            let data = '';
            res.on('data', (d) => data += d.toString());
            res.on('error', () => reject('Error sending request to RPC URL'));
            res.on('end', () => {
                resolve(JSON.parse(data)); 
            });
        });
        if (httpMethod === 'POST') {
            newReq.write(JSON.stringify(baseReq));
            newReq.end();
        }
    });
}


/**
 * 
 * @param {string} wallet 
 */
function getAllBitWhips(wallet) {

    return new Promise(async (resolve, reject) => {
        try {
            const tokenReq = await sendJSONRPCRequest([wallet, { programId: TOKEN_PROGRAM_ID.toBase58() }], 'POST', 'getTokenAccountsByOwner');
            const tokenMints = tokenReq.result.value.map((v) => v.account.data.parsed.info.mint);
            resolve(await getAllMetadataFromArrayOfMints(tokenMints));
        } catch (e) {
            // console.log(`Error in getAllBitWhips(): ${e}`);
            reject(e);
        }
    });
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

app.get('/getallwhips', async (req, res) => {
    const { wallet, username } = req.query;
    try {
        res.json(await getAllBitWhips(wallet)).send();
    }
    catch (e) {
        console.log(e);
        res.status(500).send();
    }
});

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

app.get('/getlinkeddiscords', async (req, res) => {
    const { key } = req.query;
    if (key == currentKey) {
        BWDiscordLink.find((err, doc) => {
            if (err) {
                res.status(500).send();
            } else {
                res.json(doc.map((v, i) => v.discordId)).send();
            } 
        });
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

app.get('/walletbydiscord', async (req, res) => {
    const { key, id } = req.query;
    if (key == currentKey) {
        BWDiscordLink.find({ discordId: id }, (err, doc) => {
            if (err) {
                res.status(404).send();
            } else {
                res.json({ wallet: doc[0].wallet }).send();
            }
        });
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