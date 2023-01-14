export const landevoDirtyVersions: DirtyVersionTable = {
  Body: {
    "Beach Carbon": ["Beach Carbon Dirty", "Beach Carbon Patina Dirty", "Beach Carbon Patina"],
    "Beach Clean": ["Beach Dirty", "Beach Patina Dirty", "Beach Patina"],

    "Black Carbon": ["Black Carbon Dirty", "Black Carbon Patina Dirty", "Black Carbon Patina"],
    "Black Clean": ["Black Dirty", "Black Patina Dirty", "Black Patina"],

    "Blue Carbon": ["Blue Carbon Dirty", "Blue Carbon Patina Dirty", "Blue Carbon Patina"],
    "Blue Clean": ["Blue Dirty", "Blue Patina Dirty", "Blue Patina"],

    "Crimson Carbon": ["Crimson Carbon Dirty", "Crimson Carbon Patina Dirty", "Crimson Carbon Patina"],
    "Crimson Clean": ["Crimson Dirty", "Crimson Patina Dirty", "Crimson Patina"],

    "Dusk Carbon": ["Dusk Carbon Dirty", "Dusk Carbon Patina Dirty", "Dusk Carbon Patina"],
    "Dusk Clean": ["Dusk Dirty", "Dusk Patina Dirty", "Dusk Patina"],

    "Green Carbon": ["Green Carbon Dirty", "Green Carbon Patina Dirty", "Green Carbon Patina"],
    "Green Clean": ["Green Dirty", "Green Patina Dirty", "Green Patina"],

    "Orange Carbon": ["Orange Carbon Dirty", "Orange Carbon Patina Dirty", "Orange Carbon Patina"],
    "Orange Clean": ["Orange Dirty", "Orange Patina Dirty", "Orange Patina"],

    "Pink Carbon": ["Pink Carbon Dirty", "Pink Carbon Patina Dirty", "Pink Carbon Patina"],
    "Pink Clean": ["Pink Dirty", "Pink Patina Dirty", "Pink Patina"],

    "Purple Carbon": ["Purple Carbon Dirty", "Purple Carbon Patina Dirty", "Purple Carbon Patina"],
    "Purple Clean": ["Purple Dirty", "Purple Patina Dirty", "Purple Patina"],

    "Teal Carbon": ["Teal Carbon Dirty", "Teal Carbon Patina Dirty", "Teal Carbon Patina"],
    "Teal Clean": ["Teal Dirty", "Teal Patina Dirty", "Teal Patina"],

    "White Carbon": ["White Carbon Dirty", "White Carbon Patina Dirty", "White Carbon Patina"],
    "White Clean": ["White Dirty", "White Patina Dirty", "White Patina"],

    "Yellow Carbon": ["Yellow Carbon Dirty", "Yellow Carbon Patina Dirty", "Yellow Carbon Patina"],
    "Yellow Clean": ["Yellow Dirty", "Yellow Patina Dirty", "Yellow Patina"],

    "Sunset Carbon": ["Sunset Carbon Dirty", "Sunset Carbon Patina Dirty", "Sunset Carbon Patina"],
    "Sunset Clean": ["Sunset Dirty", "Sunset Patina Dirty", "Sunset Patina"],

    "Red Carbon": ["Red Carbon Dirty", "Red Carbon Patina Dirty", "Red Carbon Patina"],
    "Red Clean": ["Red Dirty", "Red Patina Dirty", "Red Patina"],
  },
  FogLights: {
    "Stock Clean": ["Stock Dirty"],
    "Purple Clean": ["Purple Dirty"],
    "Red Clean": ["Red Dirty"],
    "Teal Clean": ["Teal Dirty"],
    "Yellow Clean": ["Yellow Dirty"],
  },

  Headlights: {
    "Blacked Out": ["Blacked Out Dirty"],
    Stock: ["Stock Dirty"],
  },

  Tint: {
    "Limo Tint Clean": ["Limo Tint Dirty"],
    "Mirror Clean": ["Mirror Dirty"],
    "Normal Clean": ["Normal Dirty"],
    "Blue Clean": ["Blue Dirty"],
    "Red Clean": ["Red Dirty"],
    "Yellow Clean": ["Yellow Dirty"],
  },

  Wheels: {
    "10 Spoke": ["10 Spoke Dirty"],
    "10 Spoke Red": ["10 Spoke Red Dirty"],
    "Rally Gold": ["Rally Gold Dirty"],
    "Rally Red": ["Rally Red Dirty"],
    "Reps Bronze": ["Reps Bronze Dirty"],
    "Reps Gold": ["Reps Gold Dirty"],
    "Reps Grey": ["Reps Grey Dirty"],
    "Reps Red": ["Reps Red Dirty"],
    "Reps White": ["Reps White Dirty"],
    Stock: ["Stock Dirty"],
  },
};

export const teslerrDirtyVersions: DirtyVersionTable = {
  Bodys: {
    "Black Clean Carbon": ["Black Dirty Carbon", "Black Dirty Patina Carbon", "Black Patina Carbon"],
    "Black Clean": ["Black Dirty", "Black Patina"],

    "Blue Clean Carbon": ["Blue Dirty Carbon", "Blue Dirty Patina Carbon", "Blue Patina Carbon"],
    "Blue Clean": ["Blue Dirty", "Blue Patina"],

    "Blue Fade Clean Carbon": ["Blue Fade Dirty Carbon", "Blue Fade Dirty Patina Carbon", "Blue Fade Patina Carbon"],
    "Blue Fade Clean": ["Blue Fade Dirty", "Blue Fade Patina"],

    "Green Clean Carbon": ["Green Dirty Carbon", "Green Dirty Patina Carbon", "Green Patina Carbon"],
    "Green Clean": ["Green Dirty", "Green Patina"],

    "Orange Clean Carbon": ["Orange Dirty Carbon", "Orange Dirty Patina Carbon", "Orange Patina Carbon"],
    "Orange Clean": ["Orange Dirty", "Orange Patina"],

    "Pink Clean Carbon": ["Pink Dirty Carbon", "Pink Dirty Patina Carbon", "Pink Patina Carbon"],
    "Pink Clean": ["Pink Dirty", "Pink Patina"],

    "Purple Clean Carbon": ["Purple Dirty Carbon", "Purple Dirty Patina Carbon", "Purple Patina Carbon"],
    "Purple Clean": ["Purple Dirty", "Purple Patina"],

    "Red Clean Carbon": ["Red Dirty Carbon", "Red Dirty Patina Carbon", "Red Patina Carbon"],
    "Red Clean": ["Red Dirty", "Red Patina"],

    "Rinbow Clean Carbon": ["Rinbow Dirty Carbon", "Rinbow Dirty Patina Carbon", "Rinbow Patina Carbon"],
    "Rinbow Clean": ["Rinbow Dirty", "Rinbow Patina"],

    "Sunset Clean Carbon": ["Sunset Dirty Carbon", "Sunset Dirty Patina Carbon", "Sunset Patina Carbon"],
    "Sunset Clean": ["Sunset Dirty", "Sunset Patina"],

    "Teal Clean Carbon": ["Teal Dirty Carbon", "Teal Dirty Patina Carbon", "Teal Patina Carbon"],
    "Teal Clean": ["Teal Dirty", "Teal Patina"],

    "Yellow Clean Carbon": ["Yellow Dirty Carbon", "Yellow Dirty Patina Carbon", "Yellow Patina Carbon"],
    "Yellow Clean": ["Yellow Dirty", "Yellow Patina"],
  },
};

export const treeFiddyDirtyVersions: DirtyVersionTable = {
  Dirt: {
    Clean: ["Dirty"],
  },
  Patina: {
    None: ["Patina"],
  },
};

export const gojiraDirtyVerions: DirtyVersionTable = {
  Dirt: {
    None: ["Dirt"],
  },
  Patina: {
    None: ["Patina"],
  },
};

export type DirtyVersionTable = {
  [category: string]: {
    [cleanTrait: string]: string[];
  };
};

export const BASE_IPFS_URL = "https://thesolden.infura-ipfs.io/ipfs";
