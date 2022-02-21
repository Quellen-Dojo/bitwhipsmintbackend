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
const DiscordOAuth = require('discord-oauth2');

const carwashCountDoc = process.env.carwashCountDoc;

const whitelistSpots = 700;

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

const NFTMetadataSchema = new Schema({
    mintAddress: String,
    metadata: Object
});

const WhitelistSeries1 = mongoose.model('Whitelist', WhitelistSchema);
const AirdropsSeries1 = mongoose.model('AirdropS1', WhitelistSchema);
const BWDiscordLink = mongoose.model('BitwhipsDiscordLink', DiscordLinkSchema);
const CarwashCount = mongoose.model('CarwashCount', CarwashCountSchema);
const LandevoMetadata = mongoose.model('LandevoMetadata', NFTMetadataSchema);
const TeslerrMetadata = mongoose.model('TeslerrMetadata', NFTMetadataSchema);

const removeWeightRegex = /^([\w\s]+)/;

const landevoDirtyVersions = {
    'Body': {
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
    },
    'FogLights': {
        'Stock Clean': ['Stock Dirty'],
        'Purple Clean': ['Purple Dirty'],
        'Red Clean': ['Red Dirty'],
        'Teal Clean': ['Teal Dirty'],
        'Yellow Clean': ['Yellow Dirty'],
    },

    'Headlights': {
        'Blacked Out': ['Blacked Out Dirty'],
        'Stock': ['Stock Dirty'],
    },

    'Tint': {
        'Limo Tint Clean': ['Limo Tint Dirty'],
        'Mirror Clean': ['Mirror Dirty'],
        'Normal Clean': ['Normal Dirty'],
        'Blue Clean': ['Blue Dirty'],
        'Red Clean': ['Red Dirty'],
        'Yellow Clean': ['Yellow Dirty']
    },

    'Wheels': {
        '10 Spoke': ['10 Spoke Dirty'],
        '10 Spoke Red': ['10 Spoke Red Dirty'],
        'Rally Gold': ['Rally Gold Dirty'],
        'Rally Red': ['Rally Red Dirty'],
        'Reps Bronze': ['Reps Bronze Dirty'],
        'Reps Gold': ['Reps Gold Dirty'],
        'Reps Grey': ['Reps Grey Dirty'],
        'Reps Red': ['Reps Red Dirty'],
        'Reps White': ['Reps White Dirty'],
        'Stock': ['Stock Dirty'],
    }
};

const teslerrDirtyVersions = {
    Bodys: {
        'Black Clean Carbon': ['Black Dirty Carbon', 'Black Dirty Patina Carbon', 'Black Patina Carbon'],
        'Black Clean': ['Black Dirty', 'Black Patina'],

        'Blue Clean Carbon': ['Blue Dirty Carbon', 'Blue Dirty Patina Carbon', 'Blue Patina Carbon'],
        'Blue Clean': ['Blue Dirty', 'Blue Patina'],

        'Blue Fade Clean Carbon': ['Blue Fade Dirty Carbon', 'Blue Fade Dirty Patina Carbon', 'Blue Fade Patina Carbon'],
        'Blue Fade Clean': ['Blue Fade Dirty', 'Blue Fade Patina'],

        'Green Clean Carbon': ['Green Dirty Carbon', 'Green Dirty Patina Carbon', 'Green Patina Carbon'],
        'Green Clean': ['Green Dirty', 'Green Patina'],

        'Orange Clean Carbon': ['Orange Dirty Carbon', 'Orange Dirty Patina Carbon', 'Orange Patina Carbon'],
        'Orange Clean': ['Orange Dirty', 'Orange Patina'],

        'Pink Clean Carbon': ['Pink Dirty Carbon', 'Pink Dirty Patina Carbon', 'Pink Patina Carbon'],
        'Pink Clean': ['Pink Dirty', 'Pink Patina'],

        'Purple Clean Carbon': ['Purple Dirty Carbon', 'Purple Dirty Patina Carbon', 'Purple Patina Carbon'],
        'Purple Clean': ['Purple Dirty', 'Purple Patina'],

        'Red Clean Carbon': ['Red Dirty Carbon', 'Red Dirty Patina Carbon', 'Red Patina Carbon'],
        'Red Clean': ['Red Dirty', 'Red Patina'],

        'Rinbow Clean Carbon': ['Rinbow Dirty Carbon', 'Rinbow Dirty Patina Carbon', 'Rinbow Patina Carbon'],
        'Rinbow Clean': ['Rinbow Dirty', 'Rinbow Patina'],

        'Sunset Clean Carbon': ['Sunset Dirty Carbon', 'Sunset Dirty Patina Carbon', 'Sunset Patina Carbon'],
        'Sunset Clean': ['Sunset Dirty', 'Sunset Patina'],

        'Teal Clean Carbon': ['Teal Dirty Carbon', 'Teal Dirty Patina Carbon', 'Teal Patina Carbon'],
        'Teal Clean': ['Teal Dirty', 'Teal Patina'],

        'Yellow Clean Carbon': ['Yellow Dirty Carbon', 'Yellow Dirty Patina Carbon', 'Yellow Patina Carbon'],
        'Yellow Clean': ['Yellow Dirty', 'Yellow Patina'],
    }
};

function findFileFromTrait(category, trait_name, carType) {
    return new Promise((resolve, reject) => {
        fs.readdir(`./${carType}_layers/${category}/`, (err, files) => {
            if (err) {
                reject(`Error locating category ${category}`);
            } else {
                for (const file of files) {
                    if (file.match(removeWeightRegex)[0] === trait_name) {
                        console.log(file);
                        resolve(file);
                        return;
                    }
                }
                reject(`Could not find trait {trait_type: '${category}', value: ${trait_name}}`);
                return;
            }
        });
    });
}

async function createLandevoMetadataMongo(mint, metadata) {
    const res = await TeslerrMetadata.create({ mintAddress: mint, metadata: metadata });
    return res;
}

async function updateNFTMetadataMongo(mint, newmetadata, carType) {
    let res;
    switch (carType) {
        case 'landevo':
            res = await LandevoMetadata.updateOne({ mintAddress: mint }, { metadata: newmetadata }).exec();
            break;
        case 'teslerr':
            res = await TeslerrMetadata.updateOne({ mintAddress: mint }, { metadata: newmetadata }).exec();
            break;
    }
    return res;
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
 * @param {string} mintAddress 
 */
async function fetchMetadataOfToken(mintAddress) {
    const topLevel = await Metadata.load(rpcConn, await Metadata.getPDA(new PublicKey(mintAddress)));
    return (await redirectThroughArweave(topLevel.data.data.uri));
}

/**
 *
 * @param {string} trait_name
 * @param {'landevo' | 'teslerr'} carType
 */
async function getCleanVersion(category, trait_name, carType) {
    let cleanTable;
    switch (carType) {
        case 'landevo':
            cleanTable = landevoDirtyVersions;
            break;
        case 'teslerr':
            cleanTable = teslerrDirtyVersions;
            break;
    }

    if (cleanTable) {
        if (cleanTable[category]) {
            for (const [cleanTrait, array] of Object.entries(cleanTable[category])) {
                if (array.includes(trait_name)) {
                    return cleanTrait;
                }
            }
        }
    } else {
        throw new Error('cleanTable was never set! (getCleanVerison)');
    }
    return trait_name;
}

/**
 * 
 * @param {object} metadata 
 * @param {string} carType 
 * @returns 
 */
async function generateCleanUploadAndUpdate(metadata,carType) {
    let newMetadata = {};
    let pureNewAttributes = [];
    const mintAddress = metadata['mint'];
    const imageSources = [];
    for (const trait of metadata['attributes']) {
        const cleanVersionTrait = await getCleanVersion(trait['trait_type'],trait['value'],carType);
        newMetadata[trait['trait_type']] = cleanVersionTrait;
        imageSources.push(`./${carType}_layers/` + trait['trait_type'] + '/' + (await findFileFromTrait(trait['trait_type'], cleanVersionTrait,carType)));
        pureNewAttributes.push({ trait_type: trait['trait_type'], value: cleanVersionTrait });
    }

    imageSources.push(`./${carType}_layers/Washed/Washed.png`)

    const newImage = await mergeImages(imageSources, {Canvas: Canvas, Image: Image});
    const imageData = newImage.replace(/^data:image\/png;base64,/, '');
    const imageBuff = Buffer.from(imageData, 'base64');

    // fs.writeFileSync(`./debugOutput/${mintAddress}.png`, imageBuff);
    
    pureNewAttributes.push({ trait_type: 'Washed', value: `Ticket Number: ${await incrementWash()}` });

    const ipfsPNGCID = await IPFSClient.add(imageBuff, { pin: true });
    const pngV0CIDStr = ipfsPNGCID.cid.toV0().toString();
    console.log(`IPFS PNG CID: ${pngV0CIDStr}`);

    metadata['attributes'] = pureNewAttributes;
    metadata['image'] = 'https://ipfs.infura.io/ipfs/' + pngV0CIDStr;

    sendMessageToDiscord(`New Car washed! ${'https://ipfs.infura.io/ipfs/' + pngV0CIDStr}`, 'Car Wash Notifications');

    metadata['properties']['files'][0]['uri'] = 'https://ipfs.infura.io/ipfs/' + pngV0CIDStr;
    delete metadata.mint;

    const newJSONCID = await IPFSClient.add(JSON.stringify(metadata), { pin: true });
    console.log(`JSON CID: ${newJSONCID.cid.toV0().toString()}`);

    const mintAddressPublicKey = new PublicKey(mintAddress);
    const topLevelMetadata = await Metadata.load(rpcConn, await Metadata.getPDA(mintAddressPublicKey));
    const topLevelDataData = topLevelMetadata.data.data;
    topLevelDataData.uri = 'https://ipfs.infura.io/ipfs/' + newJSONCID.cid.toV0().toString();
    const updateSig = await actions.updateMetadata({ connection: rpcConn, wallet: treasuryWallet, editionMint: mintAddressPublicKey, newMetadataData: topLevelDataData, });

    console.log(`Update sig for ${mintAddress}: ${updateSig}`);

    await updateNFTMetadataMongo(mintAddress, metadata,carType);

    return updateSig;
}

function validateWallet(wallet) {
    //In base58, there is no 0, O, l, or I in the wallet string.
    const walletRegex = /^[\w^0OIl]{43,44}$/g; //44-length string with only alphanumeric characters and not the above characters
    return walletRegex.test(wallet);
}

function sendMessageToDiscord(message, username,avatarImageUrl='') {
    const discordMsg = https.request(
        process.env.discordWebhook,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );
    discordMsg.write(
        JSON.stringify({
            username: username,
            avatar_url: avatarImageUrl,
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
    const appendTopLevelMetadata = (data, hash, topLevel) => { 
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
            console.log(`Error in grabbing metadata from list: ${e2}`);
            reject(e2.toString());
        }
    });
}

/**
 * 
 * @param {Array} paramsArray 
 * @param {string} httpMethod 
 * @param {string} rpcFunction 
 * @returns {Promise<object>}
 */
function sendJSONRPCRequest(paramsArray,httpMethod,rpcFunction) {
    return new Promise((resolve, reject) => {
        const baseReq = { jsonrpc: '2.0', id: 1, method: rpcFunction, params: [...paramsArray,{ encoding: 'jsonParsed' }] };
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
 * Return how many documents exists in the given Model
 * @param {mongoose.Model} model 
 * @returns {Promise<Number>}
 */
async function getNumberInModel(model) {
    return await model.estimatedDocumentCount().exec();
}

/**
 * 
 * @param {Number} ms 
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 
 * @param {String} signature 
 */
async function retryGetTransaction(signature,retries=4) {
    for (let i = 0; i < retries; i++) {
        try {
            const txn = await rpcConn.getTransaction(signature);
            console.log(txn);
            if (txn) {
                return txn;
            }
        } catch (e) {
            // console.log(e);
        }
        await sleep(1000);
    }
    throw new Error('Could not grab transaction!');
}

/**
 * Verify that the number of 'lamports' matches the pre and post balances
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

// app.post('/submit', async (req, res) => {
//     const { list } = req.body;
//     try {
//         for (const hash of list) {
//             const metadata = await fetchMetadataOfToken(hash);
//             await createLandevoMetadataMongo(hash, metadata);
//             console.log(`Created metadata for #${metadata.edition}`)
//         }
//     } catch (error) {
//         console.log(error);
//         res.status(500).send();
//     }
// });

app.get('/washedcars', async (req, res) => {
    try {
        const washedcars = (await CarwashCount.findOne({ _id: carwashCountDoc }).exec()).amount;
        res.json({ amount: washedcars }).send();
    } catch {
        res.status(500).send();
    }
});

app.get('/fulllandevodata', async (req, res) => { 
    const { key } = req.query;
    if (key == currentKey) {
        try {
            const metadataList = [];
            const docs = await LandevoMetadata.find({}).exec();
            for (doc of docs) {
                metadataList.push(doc.metadata);
            }
            res.json(metadataList).send();
        } catch {
            res.status(500).send();
        }
    } else {
        res.status(403).send();
    }
});

app.get('/fullteslerrdata', async (req, res) => {
    const { key } = req.query;
    if (key == currentKey) {
        try {
            const metadataList = [];
            const docs = await TeslerrMetadata.find({}).exec();
            for (doc of docs) {
                metadataList.push(doc.metadata);
            }
            res.json(metadataList).send();
        } catch {
            res.status(500).send();
        }
    } else {
        res.status(403).send();
    }
});

app.post('/processcarwash', async (req, res) => {
    const { signature, nft, fromWallet, type } = req.body;
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
        // Full price 200000000
        // Debug price: 1000000
        if (
            validateTxnTransferAmounts(txn.meta.preBalances, txn.meta.postBalances, 200000000, txn.meta.fee) &&
            to.toBase58() === '8ciei6XBAgjLHJjfRYSXducTWzzA5JLY9GajCzYBhLit' &&
            fromWallet == from.toBase58() &&
            !tokenMeta['Washed']
        ) {
            //update metadata here!
            try {
                await generateCleanUploadAndUpdate(tokenMeta, type);
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

app.post('/manualdiscwalletlink', async (req, res) => {
    const { key, discordId, wallet } = req.body;
    if (key == currentKey) {
        try {
            const existingDiscEntry = await BWDiscordLink.findOne({ discordId: discordId }).exec();
            const existingWalletEntry = await BWDiscordLink.findOne({ wallet: wallet }).exec();
            if (!existingDiscEntry && !existingWalletEntry) {
                await BWDiscordLink.create({ discordId: discordId.toString(), wallet: wallet });
                res.status(200).send();
            } else {
                res.status(409).send();
            }
        } catch {
            res.status(500).send();
        }
    } else {
        res.status(403).send();
    }
});

app.get('/gets1airdrop', async (req, res) => {
    const { key } = req.query;
    if (key == currentKey) {
        AirdropsSeries1.find((err, doc) => {
            if (err) {
                res.status(500).send();
            } else {
                res.json(doc.map((v) => v.wallet)).send();
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
                res.json(doc.map((v) => v.discordId)).send();
            } 
        });
    } else {
        res.status(401).send();
    }
});

//Post
app.post('/linkdiscord', async (req, res) => {
    const { discordId, wallet, key } = req.body;
    try {
        if (key == currentKey) {
            const checkRes = await checkDiscordLink(discordId, wallet);
            const whitelistedNum = await getNumberInModel(BWDiscordLink);
            const jsonRes = { exists: false, wallet: undefined, created: false, closed: false };
            if (whitelistedNum < whitelistSpots) {
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
                jsonRes['closed'] = true;
                res.json(jsonRes)
            }
        } else {
            res.status(401).send();
        }
    } catch {
        res.status(500).send();
    }
});

app.post('/unlinkdiscord', async (req, res) => {
    const { key, discordId } = req.body;
    if (key == currentKey && discordId) {
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

app.get('/discordbywallet', async (req, res) => {
    const { key, wallet } = req.query;
    if (key == currentKey) {
        BWDiscordLink.find({ wallet: wallet }, (err, doc) => {
            if (err) {
                res.status(404).send();
            } else {
                res.json({ wallet: doc[0].discordId }).send();
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

app.listen(process.env.PORT || 3002, () => console.log('Listening...'));