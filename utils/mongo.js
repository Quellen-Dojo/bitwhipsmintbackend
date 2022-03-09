const mongoose = require('mongoose');

mongoose.connect(
    `mongodb+srv://quellen:${process.env.mongopass}@cluster0.jxtal.mongodb.net/dojodb?retryWrites=true&w=majority`,
    { useNewUrlParser: true, useUnifiedTopology: true }
);

const Schema = mongoose.Schema;

const carwashCountDoc = process.env.carwashCountDoc;

const DiscordLinkSchema = new Schema({
    discordId: String,
    wallet: String,
});

const HolderSchema = new Schema({
    discordId: String,
    wallet: String,
});

const CarwashCountSchema = new Schema({
    amount: Number,
});

const NFTMetadataSchema = new Schema({
    mintAddress: String,
    metadata: Object,
});

const BWDiscordLink = mongoose.model('BitwhipsDiscordLink', DiscordLinkSchema);
const BWHolderLink = mongoose.model('BitwhipsHolderLink', HolderSchema);

const CarwashCount = mongoose.model('CarwashCount', CarwashCountSchema);
const LandevoMetadata = mongoose.model('LandevoMetadata', NFTMetadataSchema);
const TeslerrMetadata = mongoose.model('TeslerrMetadata', NFTMetadataSchema);
const TreeFiddyMetadata = mongoose.model('TreeFiddyMetadata', NFTMetadataSchema);

/**
 * Return how many documents exists in the given Model
 * @param {mongoose.Model} model 
 * @returns {Promise<Number>}
 */
async function getNumberInModel(model) {
    return await model.estimatedDocumentCount().exec();
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

async function createLandevoMetadataMongo(mint, metadata, model) {
    if (!(await model.findOne({ mintAddress: mint }).exec())) {
        const res = await model.create({ mintAddress: mint, metadata: metadata });
    }
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
        case 'treefiddy':
            res = await TreeFiddyMetadata.updateOne({ mintAddress: mint }, { metadata: newmetadata }).exec();
    }
    return res;
}

module.exports = {getNumberInModel ,updateNFTMetadataMongo, createLandevoMetadataMongo , incrementWash , BWDiscordLink, BWHolderLink, CarwashCount, LandevoMetadata, TeslerrMetadata, TreeFiddyMetadata };