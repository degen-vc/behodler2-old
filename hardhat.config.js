require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-ethers");
require('dotenv').config()

const {API_KEY, PRIVATE_KEY, PRIVATE_KEY_MAINNET, ETHERSCAN_API_KEY} = process.env;

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    kovan: {
      url: `https://kovan.infura.io/v3/${API_KEY}`,
      accounts: [PRIVATE_KEY]
    },
    // mainnet: {
    //   url: `https://mainnet.infura.io/v3/${API_KEY}`,
    //   accounts: [PRIVATE_KEY_MAINNET]
    // }
  },
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  gasPrice: "61000000000",
  gas: "auto",

  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  }
};

