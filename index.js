require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const { https } = require('follow-redirects');
const DiscordOAuth = require('discord-oauth2');
const IPFS = require('ipfs-http-client');
const bs58 = require('bs58');
const tweetnacl = require('tweetnacl');
const { PublicKey, Connection } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');

const { generateCleanUploadAndUpdate } = require('./utils/carwash/functions');
const { getNumberInModel, createLandevoMetadataMongo, BWDiscordLink, BWHolderLink, CarwashCount, LandevoMetadata, TeslerrMetadata, TreeFiddyMetadata } = require('./utils/mongo');

const carwashCountDoc = process.env.carwashCountDoc;

const whitelistSpots = 700;

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

const rpcConn = new Connection(process.env.rpcEndpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 100000,
});

let currentKey = process.env.accessKey;

/**
 * 
 * @param {string} mintAddress 
 */
async function fetchMetadataOfToken(mintAddress) {
    const topLevel = await Metadata.load(rpcConn, await Metadata.getPDA(new PublicKey(mintAddress)));
    return (await redirectThroughArweave(topLevel.data.data.uri));
}

//TODO: Validate by testing against the network
function validateWallet(wallet) {
    //In base58, there is no 0, O, l, or I in the wallet string.
    const walletRegex = /^[\w^0OIl]{43,44}$/g; //44-length string with only alphanumeric characters and not the above characters
    return walletRegex.test(wallet);
}

function sendMessageToDiscord(message, username, avatarImageUrl='') {
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

function sendHolderMessageToDiscord(message, username, avatarImageUrl = '') {
    const discordMsg = https.request(process.env.holderWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
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
    if (!metadata.data.data.creators) {
        return false;
    }

    const allowedOwners = [
        'CCw23HjhwKxxwCKdV3QUQt4XYGcQNLJPCm9rek3wkcNo', // Treasury
        'Ek4Q2tAt3vyhyN59G1EGUxRSZzYwnLSNDrYKF8AsLsNH', // Royalties
        'GXLsCeRw6Gz6o1zGewy951GgKnZHn7k4go6g9HmHjFvh', // Series 1 Candy Machine
        'D2aTkRnffuSDaoqzAEHsD4xYfutk3bVpK93uMcuFxw65', // Series 2 Candy Machine
    ];

    let valid = true;
    try {
        if (metadata.data.data.creators.filter(v => !allowedOwners.includes(v.address)).length > 0 || metadata.data.updateAuthority !== allowedOwners[0]) {
            valid = false;
        }
    } catch (e) {
        console.log(e);
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

/**
 * 
 * @param {string} wallet 
 * @returns {Promise<[number, string[]]>}
 */
async function getNumOfBitWhipsInitial(wallet) {
    const pubkey = new PublicKey(wallet);
    const accs = await sendJSONRPCRequest([wallet, { programId: TOKEN_PROGRAM_ID.toBase58() }], 'POST', 'getTokenAccountsByOwner');
    const tokenMints = accs.result.value
        .filter(v => v.account.data.parsed.info.tokenAmount.amount > 0)
        .map(v => v.account.data.parsed.info.mint);
    
    
    let numOf = 0;
    let mints = [];
    for (const mint of tokenMints) {
        try {
            const meta = await Metadata.load(rpcConn, await Metadata.getPDA(mint));
            if (verifyMetadata(meta)) {
                numOf += 1;
                mints.push(mint);
            }
        } catch {

        }
    }
    return [numOf, mints];
}

async function getNumOfBitWhipsRecheck(wallet) {
    const tokenReq = await sendJSONRPCRequest(
        [wallet, { programId: TOKEN_PROGRAM_ID.toBase58() }],
        'POST',
        'getTokenAccountsByOwner'
    );
    const tokenMints = tokenReq.result.value
        .filter(v => v.account.data.parsed.info.tokenAmount.amount > 0)
        .map(v => v.account.data.parsed.info.mint);
    
    return (await LandevoMetadata.find({ mintAddress: tokenMints }).exec()).length + (await TeslerrMetadata.find({ mintAddress: tokenMints }).exec()).length + (await TreeFiddyMetadata.find({ mintAddress: tokenMints }).exec()).length;
}

app.use(cors());
app.use(express.json());

app.get('/ping', async (req, res) => {
    // res.json((await BWDiscordLink.find({ discordId: ['416430897894522890', '733199983288909824'] }).exec()).map(v => v.wallet)).send();
    res.send('Pong!');
});

app.post('/ping', (req, res) => {
    res.send('Pong!');
});

// app.get('/numwhips', async (req, res) => {
//     const { w } = req.query;
//     res.json({ num: await getAmountOfBitWhips(w) }).send();
// });

// app.post('/submit', async (req, res) => {
//     const { list } = req.body;
//     try {
//         for (const hash of list) {
//             const metadata = await fetchMetadataOfToken(hash);
//             await createLandevoMetadataMongo(hash, metadata, TreeFiddyMetadata);
//             console.log(`Created metadata for #${metadata.edition}`)
//         }
//         res.status(200).send();
//     } catch (error) {
//         console.log(error);
//         res.status(500).send();
//     }
// });

app.get('/holderstatus', async (req, res) => {
    const { wallet } = req.query;
    res.json({valid: await BWHolderLink.find({wallet: wallet}).exec() == null})
});

app.post('/recheckHolders', async (req, res) => {
    const { key } = req.body;
    if (key === currentKey) {
        let validRes = {};
        let invalidRes = [];
        const holderDocs = await BWHolderLink.find({}).exec();
        for (const doc of holderDocs) {
            const holdingNum = await getNumOfBitWhipsRecheck(doc.wallet);
            if (holdingNum > 0) {
                validRes[doc.discordId] = holdingNum;
            } else {
                invalidRes.push(doc.discordId);
                await BWHolderLink.deleteMany({ wallet: doc.wallet }).exec();
            }
        }
        res.json({ valid: validRes, invalid: invalidRes }).send();
    } else {
        res.status(401).send();
    }
});

app.post('/submitForHolderVerif', async (req, res) => {
    const { discordId, wallet, signature } = req.body;
    const jsonRes = { error: null, success: false };
    console.log(`Holder Verif: ${discordId} ${wallet} ${signature}`);
    if (discordId && wallet && tweetnacl.sign.detached.verify(new TextEncoder().encode('I AM MY BITWHIP AND MY BITWHIP IS ME!'),bs58.decode(signature),bs58.decode(wallet))) {
        try {
            const walletCheckRes = await BWHolderLink.findOne({ discordId: discordId }).exec();
            if (walletCheckRes) {
                await BWHolderLink.updateMany({ discordId: discordId }, { discordId: discordId, wallet: wallet }).exec();
            } else {
                await BWHolderLink.create({ discordId: discordId, wallet: wallet });
                const holdingNum = await getNumOfBitWhipsRecheck(wallet);
                if (holdingNum > 0) {
                    // Submit Request to update roles.
                    sendHolderMessageToDiscord(
                        `${discordId} ${wallet} ${signature} ${holdingNum}`,
                        'Holder Verification'
                    );
                }
            }
            jsonRes.success = true;
        } catch (e) {
            console.log(e);
            jsonRes.error = true;
        }
        res.json(jsonRes).send();
    } else {
        res.status(400).send();
    }
});

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
    if (key === currentKey) {
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
    if (key === currentKey) {
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
                await generateCleanUploadAndUpdate(tokenMeta, type, IPFSClient);
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

app.get('/getlinks', async (req, res) => {
    const { key } = req.query;
    if (key === currentKey) {
        BWDiscordLink.find((err, doc) => {
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

app.post('/manualdiscwalletlink', async (req, res) => {
    const { key, discordId, wallet } = req.body;
    if (key === currentKey) {
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

app.get('/islinkedtodiscord', async (req, res) => {
    const { key, discordId } = req.query;
    if (key === currentKey) {
        res.json(await checkDiscordLink(discordId)).send();
    } else {
        res.status(401).send();
    }
});

app.get('/getlinkeddiscords', async (req, res) => {
    const { key } = req.query;
    if (key === currentKey) {
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

app.post('/getIdFromCode', async (req, res) => {
    try {
        const oauth2 = new DiscordOAuth({
            clientId: '940761522781683793',
            clientSecret: process.env.holderVerifSecret,
            redirectUri: process.env.holderVerifRedirect,
            requestTimeout: 10000,
        });

        const { code } = req.body;

        if (code) {
            const tokenRes = await oauth2.tokenRequest({ code: code, grantType: 'authorization_code', scope: 'identify' });
            const accessToken = tokenRes.access_token;
            const user = await oauth2.getUser(accessToken);

            res.json({ discordId: user.id, username: `${user.username}#${user.discriminator}` }).send();
        } else {
            res.status(400).send();
        }
    } catch (e) {
        res.status(500).send();
    }
});

app.post('/linkdiscord', async (req, res) => {
    const { discordId, wallet, key } = req.body;
    try {
        if (key === currentKey) {
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
                res.json(jsonRes).send();
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
    if (key === currentKey && discordId) {
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
    if (key === currentKey) {
        const wRes = await BWDiscordLink.findOne({ discordId: id }).exec();
        if (wRes) {
            res.json({ wallet: wRes.wallet }).send();
        } else {
            res.status(404).send();
        }
    } else {
        res.status(401).send();
    }
});

app.get('/discordbywallet', async (req, res) => {
    const { key, wallet } = req.query;
    if (key === currentKey) {
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

app.get('/getstats', async (req, res) => {
    const { key } = req.query;
    if (key === currentKey) {
        try {
            const numWhitelists = await getNumberInModel(BWDiscordLink);
            const numAirdrops = await getNumberInModel(BWDiscordLink);
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
    if (key === currentKey) {
        currentKey = newKey;
    }
 });

app.listen(process.env.PORT || 3002, () => console.log('Listening...'));