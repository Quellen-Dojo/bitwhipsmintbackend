const fs = require('fs');
const mergeImages = require('merge-images');
const { Canvas, Image } = require('canvas');
const { actions, NodeWallet } = require('@metaplex/js');
const { PublicKey, Connection, Keypair } = require('@solana/web3.js');
const https = require('https');

const { landevoDirtyVersions, teslerrDirtyVersions, treeFiddyDirtyVersions } = require('../constants');
const { incrementWash, updateNFTMetadataMongo } = require('../mongo');

const treasuryWallet = new NodeWallet(
    Keypair.fromSecretKey(Uint8Array.from(process.env.treasuryWallet.split(',').map(v => parseInt(v))))
);
const rpcConn = new Connection(process.env.rpcEndpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 100000,
});
const removeWeightRegex = /^([\w\s]+)/;

/**
 * 
 * @param {string} category 
 * @param {string} trait_name 
 * @param {string} carType 
 * @returns {Promise<string>}
 */
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

function sendMessageToDiscord(message, username, avatarImageUrl = '') {
    const discordMsg = https.request(process.env.discordWebhook, {
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

/**
 * @param {string} category
 * @param {string} trait_name
 * @param {'landevo' | 'teslerr' | 'treefiddy'} carType
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
        case 'treefiddy':
            cleanTable = treeFiddyDirtyVersions;
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
 * @param {}
 * @returns 
 */
async function generateCleanUploadAndUpdate(metadata,carType,IPFSClient) {
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

    await updateNFTMetadataMongo(mintAddress, metadata, carType);

    return updateSig;
}

module.exports = { generateCleanUploadAndUpdate , getCleanVersion, findFileFromTrait };