const { accounts, contract } = require('@openzeppelin/test-environment')
const { expectEvent, expectRevert, ether, balance } = require('@openzeppelin/test-helpers')
const { expect, assert } = require('chai')
const { BNtoBigInt } = require('./helpers/BigIntUtil')
const bigNum = require('./helpers/BigIntUtil')
const { BigNumber, utils } = require('ethers')
const Ganache = require('./helpers/ganache')

const TEN = 10000000000000000000n
const ONE = 1000000000000000000n
const FINNEY = 1000000000000000n

describe('Behodler1', async function () {
    const bn = (input) => BigNumber.from(input)
    const assertBNequal = (bnOne, bnTwo) => assert.strictEqual(bnOne.toString(), bnTwo.toString())

    const ganache = new Ganache()

    let accounts
    let owner
    let trader1
    let trader2
    let feeDestination
    let weiDaiReserve

    beforeEach(async function () {
        accounts = await ethers.getSigners()
        owner = accounts[0]
        trader1 = accounts[1]
        trader2 = accounts[2]
        feeDestination = accounts[3]
        weiDaiReserve = accounts[4]

        const MockSwapFactory = await ethers.getContractFactory("MockSwapFactory")

        this.uniswap = await MockSwapFactory.deploy()
        this.sushiswap = await MockSwapFactory.deploy()

        const AddressBalanceCheck = await ethers.getContractFactory("AddressBalanceCheck")
        this.addressBalanceCheckLib = await AddressBalanceCheck.deploy()
        await this.addressBalanceCheckLib.deployed()

        const Behodler = await ethers.getContractFactory(
            "Behodler",
            {
              libraries: {
                "AddressBalanceCheck": this.addressBalanceCheckLib.address
              }
            }
          );
        this.behodler = await Behodler.deploy()
        await this.behodler.deployed()

        const Lachesis = await ethers.getContractFactory("Lachesis")
        this.lachesis = await Lachesis.deploy(this.uniswap.address, this.sushiswap.address)
        await this.lachesis.deployed()

        const LiquidityReceiver = await ethers.getContractFactory("LiquidityReceiver")
        this.liquidityReceiver = await LiquidityReceiver.deploy(this.lachesis.address)
        await this.liquidityReceiver.deployed()

        const IndirectSwap = await ethers.getContractFactory("IndirectSwap")
        this.indirectSwap = await IndirectSwap.deploy(this.behodler.address)
        await this.indirectSwap.deployed()

        const Weth = await ethers.getContractFactory("WETH10")
        this.weth = await Weth.deploy()
        await this.weth.deployed()

        const MockToken1 = await ethers.getContractFactory("MockToken1")
        this.regularToken = await MockToken1.deploy()
        await this.regularToken.deployed()

        const PyroToken = await ethers.getContractFactory("Pyrotoken")
        this.pyroRegular = await PyroToken.deploy(this.regularToken.address, this.liquidityReceiver.address)
        await this.pyroRegular.deployed()

        this.dai = await MockToken1.deploy()
        await this.dai.deployed()

        this.burnableToken = await MockToken1.deploy()
        await this.burnableToken.deployed()

        this.eye = await MockToken1.deploy()
        await this.eye.deployed()

        this.invalidToken = await MockToken1.deploy()
        await this.invalidToken.deployed()

        const OpenArbiter = await ethers.getContractFactory('OpenArbiter')
        this.flashLoanArbiter = await OpenArbiter.deploy()
        await this.flashLoanArbiter.deployed()

        await this.regularToken.mint(trader1.address, 2000000n * TEN)
        await this.burnableToken.mint(trader1.address, 2000000n * TEN)
        await this.invalidToken.mint(trader1.address, TEN)

        const MockWeiDai = await ethers.getContractFactory("MockWeiDai")
        this.mockWeiDai = await MockWeiDai.deploy()
        await this.mockWeiDai.deployed()

        await this.behodler.seed(this.weth.address, this.lachesis.address, this.flashLoanArbiter.address, this.liquidityReceiver.address, weiDaiReserve.address, this.dai.address, this.mockWeiDai.address)
        await this.behodler.configureScarcity(110, 25, feeDestination.address)
        await this.lachesis.measure(this.regularToken.address, true, false)
        await this.lachesis.measure(this.burnableToken.address, true, true)

        await this.lachesis.setBehodler(this.behodler.address)
        await this.lachesis.updateBehodler(this.regularToken.address)
        await this.lachesis.updateBehodler(this.burnableToken.address)
    })

    it('adding burnable token as liquidity in 2 batches generates the correct volume of Scarcity', async function () {
        //ADD 1 FINNEY WHEN BEHODLER BALANCE OF TOKEN ZERO
        const originalBalance = 2000000n * TEN
        const expectedBalanceAfter = originalBalance - FINNEY * 2n

        const scarcitySupplyBefore = await this.behodler.totalSupply()
        assertBNequal(scarcitySupplyBefore, 0n)

        await this.burnableToken.connect(trader1).approve(this.behodler.address, originalBalance)
        await this.behodler.connect(trader1).addLiquidity(this.burnableToken.address, FINNEY * 2n)

        const tokenBalanceOfUser = await this.burnableToken.balanceOf(trader1.address) 
        
        assertBNequal(tokenBalanceOfUser, expectedBalanceAfter)

        const scarcityBalance = await this.behodler.balanceOf(trader1.address)

        const expectedScarcity = '201609232779564367355'
        assertBNequal(scarcityBalance, expectedScarcity)

        const scarcitySupplyAfter = await this.behodler.totalSupply()
        assertBNequal(scarcitySupplyAfter, expectedScarcity)

        await this.behodler.connect(trader1).addLiquidity(this.burnableToken.address, 2n * FINNEY)
        const expectedBalanceAfterSecondAdd = expectedBalanceAfter - 2n * FINNEY
        const tokenBalanceOfUserAfterSecondAdd = await this.burnableToken.balanceOf(trader1.address)
        assertBNequal(tokenBalanceOfUserAfterSecondAdd, expectedBalanceAfterSecondAdd)

        const scarcityBalanceAfterSecondAdd = await this.behodler.balanceOf(trader1.address)

        const expectedScarcityAfterSecondAdd = '220055976853273918971'
        assertBNequal(scarcityBalanceAfterSecondAdd, expectedScarcityAfterSecondAdd)

        await this.behodler.connect(trader1).addLiquidity(this.burnableToken.address, 2n * FINNEY)
        const expectedBalanceAfterThirdAdd = expectedBalanceAfterSecondAdd - 2n * FINNEY
        const tokenBalanceOfUserAfterThirdAdd = await this.burnableToken.balanceOf(trader1.address)
        assertBNequal(tokenBalanceOfUserAfterThirdAdd, expectedBalanceAfterThirdAdd)

        const scarcityBalanceAfterThirdAdd = await this.behodler.balanceOf(trader1.address)

        const expectedScarcityAfterThirdAdd = '230846630396794226075'
        assert.isTrue(scarcityBalanceAfterThirdAdd.toString() === expectedScarcityAfterThirdAdd, `${expectedScarcityAfterThirdAdd}; ${scarcityBalanceAfterThirdAdd}`)
    })

    it('adding liquidity as non burnable token does not burn', async function () {
        const originalBalance = 2000000n * TEN
        const expectedBalanceAfter = originalBalance - FINNEY * 2n

        const scarcitySupplyBefore = await this.behodler.totalSupply()
        assertBNequal(scarcitySupplyBefore, 0)

        await this.regularToken.connect(trader1).approve(this.behodler.address, originalBalance)
        await this.behodler.connect(trader1).addLiquidity(this.regularToken.address, FINNEY * 2n)
        const tokenBalanceOfUser = await this.regularToken.balanceOf(trader1.address)
        assertBNequal(tokenBalanceOfUser, expectedBalanceAfter)

        const scarcityBalance = await this.behodler.balanceOf(trader1.address)
    
        const expectedScarcity = '201609232779564367355'
        assertBNequal(scarcityBalance, expectedScarcity)

        const scarcitySupplyAfter = await this.behodler.totalSupply()
        assertBNequal(scarcitySupplyAfter, expectedScarcity)
    })

    it('adding liquidity as Eth produces correct scarcity', async function () {
        const weth = await this.behodler.Weth()
        assert.equal(weth, this.weth.address)

        const ethBalanceBefore = await balance.current(trader1.address)

        const scarcityBalanceBefore = await this.behodler.balanceOf(trader1.address)

        await this.behodler.connect(trader1).addLiquidity(weth, FINNEY * 2n, { value: (FINNEY * 2n).toString() })

        const ethBalanceAfter = await balance.current(trader1.address)
        const scarcityBalance = await this.behodler.balanceOf(trader1.address)
        const expectedScarcity = '201609232779564367355'
        assertBNequal(scarcityBalance, expectedScarcity)

        const scarcitySupplyAfter = await this.behodler.totalSupply()
        assertBNequal(scarcitySupplyAfter, expectedScarcity)
    })

    it('withdrawing scarcity transfers out the correct number of tokens', async function () {
        //scarcity supply shrinks
        await this.regularToken.connect(trader1).approve(this.behodler.address, 22n * FINNEY)
        await this.behodler.connect(trader1).addLiquidity(this.regularToken.address, 22n * FINNEY)
        const tokenBalanceBeforeWithdraw = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1.address))
        const scarcityBalanceBeforeWithdraw = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1.address))

        const scxTotalSupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply())
        const behodlerBalanceOfTokensBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        await this.behodler.connect(trader1).withdrawLiquidity(this.regularToken.address, behodlerBalanceOfTokensBefore / 3n)
        const behodlerBalanceOfTokensAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        assertBNequal(behodlerBalanceOfTokensAfter, ((behodlerBalanceOfTokensBefore * 2n) / 3n))

        const scxAfter = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1.address))
        const expectedSCXAfter = scarcityBalanceBeforeWithdraw - 10790653543520307104n
        assertBNequal(scxAfter, expectedSCXAfter)

        const scxTotalSupplyAfter = await this.behodler.totalSupply()
        assertBNequal(scxTotalSupplyAfter, (scxTotalSupplyBefore - 10790653543520307104n))
    })

    it('swap in burnable should swap out regular at correct exchange rate', async function () {
        await this.burnableToken.connect(trader1).transfer(this.behodler.address, ONE)
        await this.regularToken.connect(trader1).transfer(this.behodler.address, 16n * ONE)

        await this.burnableToken.connect(trader1).approve(this.behodler.address, 2n * TEN)

        const initialInputBalance = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(this.behodler.address))
        const initialOutputBalance = await await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        const inputAmount = FINNEY * 10n
        const netInputAmount = (inputAmount * 975n) / 1000n
        const expectedFinalInputBalance = initialInputBalance + netInputAmount

        let finalOutputBalance = (initialInputBalance * initialOutputBalance) / expectedFinalInputBalance

        let outputAmount = initialOutputBalance - finalOutputBalance
        let initials = initialInputBalance * initialOutputBalance
        let finals = expectedFinalInputBalance * finalOutputBalance
        let residual = initials - finals
        const precision = 1000000000000000000n
        const inputRatio = (expectedFinalInputBalance * precision) / initialInputBalance
        const outputRatio = (initialOutputBalance * precision) / finalOutputBalance

        const inputBalanceBefore = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1.address))
        const outputBalanceBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1.address))
        await this.behodler.connect(trader1).swap(this.burnableToken.address, this.regularToken.address, FINNEY * 10n, outputAmount)
        const inputBalanceAfter = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1.address))
        const outputBalanceAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1.address))

        const inputChange = (inputBalanceBefore - inputBalanceAfter)
        const outputChange = (outputBalanceAfter - outputBalanceBefore)
        assertBNequal(inputChange, inputAmount)
        assertBNequal(outputChange, outputAmount)
    })

    it('fake Janus has the same effect as direct swap', async function () {
        await this.burnableToken.connect(trader1).transfer(this.behodler.address, ONE)
        await this.regularToken.connect(trader1).transfer(this.behodler.address, 16n * ONE)
        await this.burnableToken.connect(trader1).approve(this.indirectSwap.address, 2n * TEN)

        const initialInputBalance = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(this.behodler.address))
        const initialOutputBalance = await await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        const inputAmount = FINNEY * 10n
        const netInputAmount = (inputAmount * 975n) / 1000n
        const expectedFinalInputBalance = initialInputBalance + netInputAmount

        let finalOutputBalance = (initialInputBalance * initialOutputBalance) / expectedFinalInputBalance

        let outputAmount = initialOutputBalance - finalOutputBalance
        let initials = initialInputBalance * initialOutputBalance
        let finals = expectedFinalInputBalance * finalOutputBalance
        let residual = initials - finals
        const precision = 1000000000000000000n
        const inputRatio = (expectedFinalInputBalance * precision) / initialInputBalance
        const outputRatio = (initialOutputBalance * precision) / finalOutputBalance

        const inputBalanceBefore = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1.address))
        const outputBalanceBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1.address))

        await this.indirectSwap.connect(trader1).swap(this.burnableToken.address, this.regularToken.address, FINNEY * 10n, outputAmount);
        const inputBalanceAfter = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1.address))
        const outputBalanceAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1.address))

        const inputChange = (inputBalanceBefore - inputBalanceAfter)
        const outputChange = (outputBalanceAfter - outputBalanceBefore)
        assertBNequal(inputChange, inputAmount)
        assertBNequal(outputChange, outputAmount)
    })
})

describe('Behodler2: Pyrotoken', async function () {
    const bn = (input) => BigNumber.from(input)
    const assertBNequal = (bnOne, bnTwo) => assert.strictEqual(bnOne.toString(), bnTwo.toString())

    const ganache = new Ganache()

    let accounts
    let owner
    let trader1
    let trader2
    let feeDestination
    let weiDaiReserve

    beforeEach(async function () {
        accounts = await ethers.getSigners()
        owner = accounts[0]
        trader1 = accounts[1]
        trader2 = accounts[2]
        feeDestination = accounts[3]
        weiDaiReserve = accounts[4]

        const MockSwapFactory = await ethers.getContractFactory("MockSwapFactory")

        this.uniswap = await MockSwapFactory.deploy()
        this.sushiswap = await MockSwapFactory.deploy()

        const AddressBalanceCheck = await ethers.getContractFactory("AddressBalanceCheck")
        this.addressBalanceCheckLib = await AddressBalanceCheck.deploy()
        await this.addressBalanceCheckLib.deployed()

        const Behodler = await ethers.getContractFactory(
            "Behodler",
            {
              libraries: {
                "AddressBalanceCheck": this.addressBalanceCheckLib.address
              }
            }
          );
        this.behodler = await Behodler.deploy()
        await this.behodler.deployed()

        const Weth = await ethers.getContractFactory("WETH10")
        this.weth = await Weth.deploy()
        await this.weth.deployed()

        const MockToken1 = await ethers.getContractFactory("MockToken1")
        this.regularToken = await MockToken1.deploy()
        await this.regularToken.deployed()
                
        this.dai = await MockToken1.deploy()
        await this.dai.deployed()

        this.burnableToken = await MockToken1.deploy()
        await this.burnableToken.deployed()

        this.eye = await MockToken1.deploy()
        await this.eye.deployed()

        this.invalidToken = await MockToken1.deploy()
        await this.invalidToken.deployed()

        const OpenArbiter = await ethers.getContractFactory('OpenArbiter')
        this.flashLoanArbiter = await OpenArbiter.deploy()
        await this.flashLoanArbiter.deployed()

        const Lachesis = await  ethers.getContractFactory('Lachesis')
        this.lachesis = await Lachesis.deploy(this.uniswap.address, this.sushiswap.address)
        await this.lachesis.deployed()

        const regularTokenAddress = this.regularToken.address;

        await this.regularToken.mint(trader1.address, 2000000n * TEN)
        await this.burnableToken.mint(trader1.address, 2000000n * TEN)
        await this.invalidToken.mint(trader1.address, TEN)

        const MockWeiDai = await ethers.getContractFactory("MockWeiDai")
        this.mockWeiDai = await MockWeiDai.deploy()
        await this.mockWeiDai.deployed()

        await this.lachesis.measure(this.regularToken.address, true, false)
        await this.lachesis.measure(this.burnableToken.address, true, true)

        await this.lachesis.setBehodler(this.behodler.address)  
        
        const LiquidityReceiver = await ethers.getContractFactory('LiquidityReceiver')
        this.liquidityReceiver = await LiquidityReceiver.deploy(this.lachesis.address)
        await this.liquidityReceiver.deployed()

        this.liquidityReceiver.registerPyroToken(this.regularToken.address)
        await this.liquidityReceiver.deployed()

        const PyroToken = await ethers.getContractFactory("Pyrotoken")
        const pyroTokenAddress = await this.liquidityReceiver.baseTokenMapping(regularTokenAddress)
        this.pyroRegular = await PyroToken.attach(pyroTokenAddress)

        await this.behodler.seed(this.weth.address, this.lachesis.address, this.flashLoanArbiter.address, this.liquidityReceiver.address, weiDaiReserve.address, this.dai.address, this.mockWeiDai.address)
        await this.behodler.configureScarcity(110, 25, feeDestination.address)        
        await this.lachesis.updateBehodler(this.regularToken.address)
        await this.lachesis.updateBehodler(this.burnableToken.address)
    })

    it('adding liquidity as non burnable fills liquidity receiver which fills pyrotoken', async function () {
        this.timeout(500000);

        const originalBalance = 2000000n * TEN
        const expectedBalanceAfter = originalBalance - FINNEY * 2n

        const scarcitySupplyBefore = await this.behodler.totalSupply()
        assertBNequal(scarcitySupplyBefore, (0n))
    
        await this.regularToken.connect(trader1).approve(this.behodler.address, originalBalance)
        await this.behodler.connect(trader1).addLiquidity(this.regularToken.address, FINNEY * 2n)
        const tokenBalanceOfUser = await this.regularToken.balanceOf(trader1.address)
        assertBNequal(tokenBalanceOfUser, expectedBalanceAfter)

        const scarcityBalance = await this.behodler.balanceOf(trader1.address)

        const expectedScarcity = '201609232779564367355'
        assertBNequal(scarcityBalance, expectedScarcity)

        const scarcitySupplyAfter = (await this.behodler.totalSupply())
        assertBNequal(scarcitySupplyAfter, expectedScarcity)
        const balanceOfLiquidityReceiverBefore = await this.regularToken.balanceOf(this.liquidityReceiver.address)
        assertBNequal(balanceOfLiquidityReceiverBefore, (BigInt(5 * Math.pow(10, 13))))
        const redeemRateBeforeMint = await this.pyroRegular.redeemRate()
        assertBNequal(redeemRateBeforeMint, ONE)

        await this.regularToken.connect(trader1).approve(this.pyroRegular.address, FINNEY * 3n)

        await this.pyroRegular.connect(trader1).mint(FINNEY)
        const pyroBalance = await this.pyroRegular.balanceOf(trader1.address)
        assertBNequal(FINNEY, pyroBalance)
        const redeemRateAfterMint = await this.pyroRegular.redeemRate()
        assertBNequal(redeemRateAfterMint, 1050000000000000000n)

        const balanceOfLiquidityReceiverAfter = await this.regularToken.balanceOf(this.liquidityReceiver.address)
        assertBNequal(balanceOfLiquidityReceiverAfter, 0)

        const redeemRateAfter = await this.pyroRegular.redeemRate()
        assertBNequal(redeemRateAfter, 1050000000000000000)
        await this.regularToken.connect(trader1).approve(this.behodler.address, FINNEY * 100n)

        await this.pyroRegular.connect(trader1).mint(FINNEY)
        const redeemRateAfterSecondMint = await this.pyroRegular.redeemRate()
    })
})
