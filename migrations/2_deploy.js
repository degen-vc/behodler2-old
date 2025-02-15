const Lachesis = artifacts.require('Lachesis')
const OpenArbiter = artifacts.require('OpenArbiter')
const Behodler = artifacts.require('Behodler')
const LiquidityReceiver = artifacts.require('LiquidityReceiver')
const AddressBalanceCheck = artifacts.require('AddressBalanceCheck')
const ABDK = artifacts.require('ABDK')
const MockSwapFactory = artifacts.require('MockSwapFactory')
const WETH10 = artifacts.require('WETH10')
const redis = require('redis')
const client = redis.createClient();
client.on('error', console.log)
const weth10Location = './weth10.txt'
const fs = require('fs')
module.exports = async function (deployer, network, accounts) {
    var lachesisInstance, openArbiterInstance, behodlerInstance, liquidityReceiverInstance

    await deployer.deploy(MockSwapFactory)
    const uniswap = await MockSwapFactory.deployed()

    const sushiSwap = await MockSwapFactory.new()
    await deployer.deploy(Lachesis, uniswap.address, sushiSwap.address)
    lachesisInstance = await Lachesis.deployed();

    await deployer.deploy(OpenArbiter)
    openArbiterInstance = await OpenArbiter.deployed()

    await deployer.deploy(LiquidityReceiver, lachesisInstance.address)
    liquidityReceiverInstance = await LiquidityReceiver.deployed();
    client.set('liquidityReceiver', liquidityReceiverInstance.address)
    await deployer.deploy(AddressBalanceCheck)
    await deployer.link(AddressBalanceCheck, Behodler)

    await deployer.deploy(ABDK)
    await deployer.link(ABDK, Behodler)

    await deployer.deploy(Behodler)
    behodlerInstance = await Behodler.deployed()

    await lachesisInstance.setBehodler(behodlerInstance.address)
    var tokens = getTokenAddresses()
    var weiDaiStuff = getWeiDaiStuff()
    var wethAddress = getWeth(tokens)
    await deployer.deploy(WETH10)
    const weth10Instance = await WETH10.deployed()
    client.set('WETH10', weth10Instance.address)
    fs.writeFileSync(weth10Location, weth10Instance.address)
    await behodlerInstance.configureScarcity(110, 25, accounts[0])

    await behodlerInstance.seed(weth10Instance.address,
        lachesisInstance.address,
        openArbiterInstance.address,
        liquidityReceiverInstance.address,
        weiDaiStuff.inertReserve,
        weiDaiStuff.dai,
        weiDaiStuff.weiDai)
    client.set('behodler2', behodlerInstance.address)
    client.set('lachesis2', lachesisInstance.address)
    client.quit()

    const addresses = {
        behodler: behodlerInstance.address,
        lachesis: lachesisInstance.address,
        liquidityReceiver: liquidityReceiverInstance.address
    }

    fs.writeFileSync('behodler2DevAddresses.json', JSON.stringify(addresses, null, 4), 'utf8')
    try {
        await lachesisInstance.measure(weth10Instance.address, true, false)
        await lachesisInstance.updateBehodler(weth10Instance.address)
        await liquidityReceiverInstance.registerPyroToken(weth10Instance.address)
    } catch {

    }

    console.log('tokens: ' + JSON.stringify(tokens))
    for (let i = 0; i < tokens.length; i++) {
        try {
            await lachesisInstance.measure(tokens[i], true, false)
            await lachesisInstance.updateBehodler(tokens[i])
            await liquidityReceiverInstance.registerPyroToken(tokens[i])
        } catch {

        }
    }

    await lachesisInstance.measure(weiDaiStuff['weiDai'], true, false)
    await lachesisInstance.updateBehodler(weiDaiStuff['weiDai'])
    console.log('BEHODLER 2 MIGRATION COMPLETE')
}


function getTokenAddresses() {
    const location = './Behodler1mappings.json'
    const content = fs.readFileSync(location, 'utf-8')
    const structure = JSON.parse(content)
    const list = structure.filter(s => s.name == 'development')[0].list
    const predicate = (item) => item.contract.toLowerCase().startsWith('mock')///item.contract.toLowerCase().startsWith('mock')//previously mock
    const behodlerAddresses = list.filter(predicate).map(item => item.address)
    return behodlerAddresses
}

function getWeth() {
    const location = './Behodler1mappings.json'
    const content = fs.readFileSync(location, 'utf-8')
    const structure = JSON.parse(content)
    const list = structure.filter(s => s.name == 'development')[0].list
    const predicate = (item) => item.contract === ('MockWeth')
    return list.filter(predicate)[0].address
}

function getWeiDaiStuff() {
    return JSON.parse(fs.readFileSync('weidai.json', 'utf-8'))
}
