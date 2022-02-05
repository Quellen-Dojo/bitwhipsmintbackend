require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const { https } = require('follow-redirects');
const { actions, NodeWallet } = require('@metaplex/js');
const { PublicKey, AccountInfo, LAMPORTS_PER_SOL, Connection, Keypair  } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Metadata, MetadataData } = require('@metaplex-foundation/mpl-token-metadata');
const fs = require('fs');
const mergeImages = require('merge-images');
const { Canvas, Image } = require('canvas');
const IPFS = require('ipfs-http-client');
const { Wallet } = require('@project-serum/anchor');
// const { File, NFTStorage } = require('nft.storage');

const carwashCountDoc = process.env.carwashCountDoc;

mongoose.connect(
    `mongodb+srv://quellen:${process.env.mongopass}@cluster0.jxtal.mongodb.net/dojodb?retryWrites=true&w=majority`,
    { useNewUrlParser: true, useUnifiedTopology: true }
);

const IPFSClient = IPFS.create({
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https',
    headers: {
        authorization:
            'Basic ' + Buffer.from(process.env.infuraIPFSProjectID + ':' + process.env.infuraIPFSProjectSecret).toString('base64'),
    },
    apiPath: '/api/v0',
});

app.use(cors());
app.use(express.json());

const Schema = mongoose.Schema;
const ObjectID = Schema.ObjectId;

const rpcConn = new Connection(process.env.rpcEndpoint, {commitment: 'confirmed', confirmTransactionInitialTimeout: 100000});

const treasuryWallet = new NodeWallet(Keypair.fromSecretKey(Uint8Array.from(process.env.treasuryWallet.split(',').map(v => parseInt(v)))));

console.log(`Treasury Wallet: ${treasuryWallet.publicKey.toBase58()}`);

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

const CarwashCountSchema = new Schema({
    amount: Number
});

const WhitelistSeries1 = mongoose.model('Whitelist', WhitelistSchema);
const AirdropsSeries1 = mongoose.model('AirdropS1', WhitelistSchema);
const BWDiscordLink = mongoose.model('BitwhipsDiscordLink', DiscordLinkSchema);
const CarwashCount = mongoose.model('CarwashCount', CarwashCountSchema);

removeWeightRegex = /^([\w\s]+)/;

const dirtyVersions = {
    'Beach Carbon': ['Beach Carbon Dirty', 'Beach Carbon Patina Dirty', 'Beach Carbon Patina'],
    'Beach Clean': ['Beach Dirty', 'Beach Patina Dirty', 'Beach Patina'],

    'Black Carbon': ['Black Carbon Dirty', 'Black Carbon Patina Dirty', 'Black Carbon Patina'],
    'Black Clean': ['Black Dirty', 'Black Patina Dirty', 'Black Patina'],

    'Blue Carbon': ['Blue Carbon Dirty', 'Blue Carbon Patina Dirty', 'Blue Carbon Patina'],
    'Blue Clean': ['Blue Dirty', 'Blue Patina Dirty', 'Blue Patina'],

    'Crimson Carbon': ['Crimson Carbon Dirty', 'Crimson Carbon Patina Dirty', 'Crimson Carbon Patina'],
    'Crimson Clean': ['Crimson Dirty', 'Crimson Patina Dirty', 'Crimson Patina'],

    'Dusk Carbon': ['Dusk Carbon Dirty', 'Dusk Carbon Patina Dirty', 'Dusk Carbon Patina'],
    'Dusk Clean': ['Dusk Dirty', 'Dusk Patina Dirty', 'Dusk Patina'],

    'Green Carbon': ['Green Carbon Dirty', 'Green Carbon Patina Dirty', 'Green Carbon Patina'],
    'Green Clean': ['Green Dirty', 'Green Patina Dirty', 'Green Patina'],

    'Orange Carbon': ['Orange Carbon Dirty', 'Orange Carbon Patina Dirty', 'Orange Carbon Patina'],
    'Orange Clean': ['Orange Dirty', 'Orange Patina Dirty', 'Orange Patina'],

    'Pink Carbon': ['Pink Carbon Dirty', 'Pink Carbon Patina Dirty', 'Pink Carbon Patina'],
    'Pink Clean': ['Pink Dirty', 'Pink Patina Dirty', 'Pink Patina'],

    'Purple Carbon': ['Purple Carbon Dirty', 'Purple Carbon Patina Dirty', 'Purple Carbon Patina'],
    'Purple Clean': ['Purple Dirty', 'Purple Patina Dirty', 'Purple Patina'],

    'Teal Carbon': ['Teal Carbon Dirty', 'Teal Carbon Patina Dirty', 'Teal Carbon Patina'],
    'Teal Clean': ['Teal Dirty', 'Teal Patina Dirty', 'Teal Patina'],

    'White Carbon': ['White Carbon Dirty', 'White Carbon Patina Dirty', 'White Carbon Patina'],
    'White Clean': ['White Dirty', 'White Patina Dirty', 'White Patina'],

    'Yellow Carbon': ['Yellow Carbon Dirty', 'Yellow Carbon Patina Dirty', 'Yellow Carbon Patina'],
    'Yellow Clean': ['Yellow Dirty', 'Yellow Patina Dirty', 'Yellow Patina'],

    'Sunset Carbon': ['Sunset Carbon Dirty', 'Sunset Carbon Patina Dirty', 'Sunset Carbon Patina'],
    'Sunset Clean': ['Sunset Dirty', 'Sunset Patina Dirty', 'Sunset Patina'],

    'Red Carbon': ['Red Carbon Dirty', 'Red Carbon Patina Dirty', 'Red Carbon Patina'],
    'Red Clean': ['Red Dirty', 'Red Patina Dirty', 'Red Patina'],

    'Stock Clean': ['Stock Dirty'],

    'Blacked Out': ['Blacked Out Dirty'],

    'Blue Clean': ['Blue Dirty'],
    'Limo Tint Clean': ['Limo Tint Dirty'],
    'Mirror Clean': ['Mirror Dirty'],
    'Normal Clean': ['Normal Dirty'],

    '10 Spoke': ['10 Spoke Dirty'],
    '10 Spoke Red': ['10 Spoke Red Dirty'],
    'Rally Gold': ['Rally Gold Dirty'],
    'Rally Red': ['Rally Red Dirty'],
    'Reps Bronze': ['Reps Bronze Dirty'],
    'Reps Gold': ['Reps Gold Dirty'],
    'Reps Grey': ['Reps Grey Dirty'],
    'Reps Red': ['Reps Red Dirty'],
    'Reps White': ['Reps White Dirty'],
    Stock: ['Stock Dirty'],
};

const alwaysClean = [
    'Rally White',
    'Rally Crint',
    'Omnitrix',
    'Reps Crint',
    'Reps Green Clean',
    'Reps Pink',
    'Chameleon',
];

function findFileFromTrait(category, trait_name) {
    return new Promise((resolve, reject) => {
        fs.readdir(`./landevo_layers/${category}/`, (err, files) => {
            if (err) {
                reject(`Error locating category ${category}`);
            } else {
                for (file of files) {
                    if (file.match(removeWeightRegex)[0] === trait_name) {
                        // console.log(file);
                        resolve(file);
                    }
                }
                reject(`Could not find trait {trait_type: '${category}', value: ${trait_name}}`);
            }
        });
    });
}

function incrementWash() {
    return new Promise((resolve, reject) => {
        CarwashCount.findById(carwashCountDoc, async (err, doc) => {
            if (err) {
                reject('Cannot find document');
            } else {
                const newVal = doc.amount + 1;
                await CarwashCount.updateOne({ _id: carwashCountDoc }, { amount: newVal }).exec();
                resolve(newVal);
            }
        });
    });
}

/**
 * 
 * @param {string} tadd 
 */
async function fetchMetadataOfToken(tadd) {
    const topLevel = await Metadata.load(rpcConn, await Metadata.getPDA(new PublicKey(tadd)));
    return (await redirectThroughArweave(topLevel.data.data.uri));
}

/**
 *
 * @param {string} trait_name
 */
async function getCleanVersion(category,trait_name) {
    for (trait of Object.keys(dirtyVersions)) {
        try {
            if (dirtyVersions[trait].includes(trait_name) && await findFileFromTrait(category, trait)) {
                return trait;
            }
        } catch {
            continue;
        }
    }
    return trait_name;
}

async function generateCleanUploadAndUpdate(metadata) {
    let newMetadata = {};
    let pureNewAttributes = [];
    const mintAddress = metadata['mint'];
    const imageSources = [];
    for (const trait of metadata['attributes']) {
        const cleanVersionTrait = await getCleanVersion(trait['trait_type'],trait['value']);
        newMetadata[trait['trait_type']] = cleanVersionTrait;
        imageSources.push('./landevo_layers/' + trait['trait_type'] + '/' + (await findFileFromTrait(trait['trait_type'], cleanVersionTrait)));
        pureNewAttributes.push({ trait_type: trait['trait_type'], value: cleanVersionTrait });
    }

    imageSources.push('./landevo_layers/Washed/Washed.png')
    pureNewAttributes.push({ trait_type: 'Washed', value: `Ticket Number: ${await incrementWash()}` });

    const newImage = await mergeImages(imageSources, {Canvas: Canvas, Image: Image});
    const imageData = newImage.replace(/^data:image\/png;base64,/, '');
    const imageBuff = Buffer.from(imageData, 'base64');

    // fs.writeFileSync(`./carwashOutput/${mintAddress}.png`, imageBuff);
    
    const ipfsCID = await IPFSClient.add(imageBuff, { pin: true });
    const newCIDStr = ipfsCID.cid.toV0().toString();
    console.log(`IPFS PNG CID: ${newCIDStr}`);

    metadata['attributes'] = pureNewAttributes;
    metadata['image'] = 'https://ipfs.infura.io/ipfs/' + newCIDStr;

    sendMessageToDiscord(`New Car washed! ${'https://ipfs.infura.io/ipfs/' + newCIDStr}`, 'Car Wash Notifications');

    metadata['properties']['files'][0]['uri'] = 'https://ipfs.infura.io/ipfs/' + newCIDStr;
    delete metadata.mint;

    const newJSONCID = await IPFSClient.add(JSON.stringify(metadata), { pin: true });
    console.log(`JSON CID: ${newJSONCID.cid.toV0().toString()}`);
    console.log('Uploaded JSON!');

    const mintKey = new PublicKey(mintAddress);
    const topLevelMetadata = await Metadata.load(rpcConn, await Metadata.getPDA(mintKey));
    const topLevelDataData = topLevelMetadata.data.data;
    topLevelDataData.uri = 'https://ipfs.infura.io/ipfs/' + newJSONCID.cid.toV0().toString();
    console.log(topLevelDataData);
    const updateSig = await actions.updateMetadata({ connection: rpcConn, wallet: treasuryWallet, editionMint: mintKey, newMetadataData: topLevelDataData, });

    console.log(`Update sig for ${mintAddress}: ${updateSig}`);

    return updateSig;
}

function validateWallet(wallet) {
    //In base58, there is no 0, O, l, or I in the wallet string.
    const walletRegex = /^[\w^0OIl]{44}$/g; //44-length string with only alphanumeric characters and not the above characters
    return walletRegex.test(wallet);
}

function sendMessageToDiscord(message, username) {
    const discordMsg = https.request(
        process.env.discordWebhook,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );
    discordMsg.write(
        JSON.stringify({
            username: username,
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

function redirectThroughArweave(url) {
    return new Promise((resolve, reject) => {
        const arReq = https.get(url, { headers: { 'Content-Type': 'application/json' } }, (res) => {
            try {
                let data = '';
                res.on('data', (d) => data += d.toString());
                res.on('error', () => reject());
                res.on('end', () => {
                    resolve(JSON.parse(data));
                });
            }
            catch {
                reject();
            }
        });
    })
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

function getAllMetadataFromArrayOfMints(mints, topLevel = false) {
    
    /**
     * 
     * @param {object} data 
     * @param {string} hash
     * @param {boolean?} topLevel 
     */
    const appendTopLevelMetadata = (data,hash, topLevel) => { 
        if (!topLevel) { return data; } else {
            data['mint'] = hash;
        }
        return data;
    };

    return new Promise(async (resolve, reject) => {
        try {
            const BitWhips = [];
            for (hash of mints) {
                try {
                    const tokenMeta = await Metadata.load(rpcConn, await Metadata.getPDA(hash));
                    if (verifyMetadata(tokenMeta)) {
                        BitWhips.push(appendTopLevelMetadata(await redirectThroughArweave(tokenMeta.data.data.uri),hash,topLevel));
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
function getAllBitWhips(wallet, topLevel=false) {
    return new Promise(async (resolve, reject) => {
        try {
            const tokenReq = await sendJSONRPCRequest([wallet, { programId: TOKEN_PROGRAM_ID.toBase58() }], 'POST', 'getTokenAccountsByOwner');
            // console.log(tokenReq);
            const tokenMints = tokenReq.result.value.filter(v => v.account.data.parsed.info.tokenAmount.amount > 0).map((v) => v.account.data.parsed.info.mint);
            // console.log(tokenMints);
            resolve(await getAllMetadataFromArrayOfMints(tokenMints,topLevel));
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryGetTransaction(sig) {
    let tries = 0;
    while (tries < 4) {
        try {
            const txn = await rpcConn.getTransaction(sig);
            console.log(txn);
            if (txn) {
                return txn;
            }
            continue;
        } catch (e) {
            console.log(e);
            tries += 1;
        }
        await sleep(1000);
    }
    throw new Error('Could not grab transaction!');
}

/**
 * 
 * @param {[Number,Number,Number]} preBalances 
 * @param {[Number,Number,Number]} postBalances 
 * @param {Number} lamports 
 * @param {Number} fee 
 * @returns 
 */
function validateTxnTransferAmounts(preBalances, postBalances, lamports, fee) {
    return (preBalances[0] - postBalances[0]  === lamports + fee && postBalances[1] - preBalances[1] === lamports)
}

app.get('/ping', (req, res) => {
    res.send('Pong!');
});

app.post('/processcarwash', async (req, res) => {
    const { signature, nft, fromWallet } = req.body;
    try {
        // console.log(nft);
        await sleep(2000);
        console.log(await rpcConn.confirmTransaction(signature, 'confirmed'));
        const txn = await retryGetTransaction(signature);
        const tokenMeta = await fetchMetadataOfToken(nft.mint);
        tokenMeta['mint'] = nft.mint;
        console.log(txn);
        const from = txn.transaction.message.accountKeys[0];
        const to = txn.transaction.message.accountKeys[1];
        if (
            validateTxnTransferAmounts(txn.meta.preBalances, txn.meta.postBalances, 200000000, txn.meta.fee) &&
            to.toBase58() === '8ciei6XBAgjLHJjfRYSXducTWzzA5JLY9GajCzYBhLit' &&
            fromWallet == from.toBase58() &&
            !tokenMeta['Washed']
        ) {
            //update metadata here!
            try {
                await generateCleanUploadAndUpdate(tokenMeta);
                res.status(200).send();
            } catch (generationError) {
                sendMessageToDiscord(
                    `<@&898643399299694622> <@&900148882489634836> **SERIOUS ERROR WITH THE CARWASH**\n\nTxn Signature: ${signature}\n\nWe may have to refund this transaction!\n\n${generationError}`,
                    'Car Wash Notifications'
                );
                res.status(500).send();
            }
        } else {
            res.status(304).send();
        }
    } catch (e) {
        console.log(e);
        sendMessageToDiscord(`ERROR WITH CAR WASH: ${e}\n\nSignature (if exists): ${signature}`,'Car Wash Notifications');
        res.status(500).send();
    }
});

app.get('/getallwhips', async (req, res) => {
    const { wallet, username, includeTopLevel } = req.query;
    if (validateWallet(wallet)) {
        try {
            res.json(await getAllBitWhips(wallet,includeTopLevel === 'true')).send();
        }
        catch (e) {
            console.log(e);
            res.status(500).send();
        }
    }
    else {
        res.status(400).send();
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