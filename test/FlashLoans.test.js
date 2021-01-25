const { accounts, contract } = require('@openzeppelin/test-environment');
const { expectEvent, expectRevert, ether } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');
const { BNtoBigInt } = require('./helpers/BigIntUtil');
const bigNum = require('./helpers/BigIntUtil')

const Behodler = contract.fromArtifact('Behodler');
const AddressBalanceCheck = contract.fromArtifact('AddressBalanceCheck');
const MockToken1 = contract.fromArtifact('MockToken1')
const MockWeth = contract.fromArtifact('MockWeth')
const OpenArbiter = contract.fromArtifact('OpenArbiter')
const RejectionArbiter = contract.fromArtifact('MockRejectionArbiter')
const Lachesis = contract.fromArtifact('Lachesis')
const InertFlashLoanReceiver = contract.fromArtifact('InertFlashLoanReceiver')
const LiquidityReceiver = contract.fromArtifact('LiquidityReceiver')
const DodgyFlashLoanReceiver = contract.fromArtifact('DodgyFlashLoanReceiver')
const MockSwapFactory = contract.fromArtifact('MockSwapFactory')

const TEN = 10000000000000000000n
const ONE = 1000000000000000000n
const FINNEY = 1000000000000000n


describe('FlashLoans', async function () {
    const [owner, trader1, trader2, feeDestination, weiDaiReserve] = accounts;

    beforeEach(async function () {
        this.uniswap = await MockSwapFactory.new()
        this.sushiswap = await MockSwapFactory.new()

        const addressBalanceCheckLib = await AddressBalanceCheck.new()
        await Behodler.detectNetwork()
        await Behodler.link('AddressBalanceCheck', addressBalanceCheckLib.address)
        this.behodler = await Behodler.new({ from: owner });

        this.weth = await MockWeth.new({ from: owner })
        this.regularToken = await MockToken1.new({ from: owner })

        this.dai = await MockToken1.new({ from: owner })
        this.burnableToken = await MockToken1.new({ from: owner })
        this.eye = await MockToken1.new({ from: owner })
        this.invalidToken = await MockToken1.new({ from: owner })
        this.openArbiter = await OpenArbiter.new({ from: owner })
        this.rejectionArbiter = await RejectionArbiter.new({ from: owner })
        this.lachesis = await Lachesis.new(this.uniswap.address,this.sushiswap.address,{ from: owner })
        this.inertFlashLoanReceiver = await InertFlashLoanReceiver.new({ from: owner })
        this.liquidityReceiver = await LiquidityReceiver.new({ from: owner });
        this.dodgyFlashLoanReceiver = await DodgyFlashLoanReceiver.new(this.behodler.address, trader1, { from: owner });

        await this.regularToken.mint(trader1, 2n * TEN)
        await this.burnableToken.mint(trader1, 2n * TEN)
        await this.invalidToken.mint(trader1, TEN)

        await this.behodler.seed(this.weth.address, this.lachesis.address, this.openArbiter.address, this.liquidityReceiver.address, weiDaiReserve, this.dai.address, { from: owner })
        await this.behodler.configureScarcity(110, 25, feeDestination, { from: owner })
        await this.lachesis.measure(this.regularToken.address, true, false, { from: owner })
        await this.lachesis.measure(this.burnableToken.address, true, true, { from: owner })

        await this.lachesis.setBehodler(this.behodler.address, { from: owner })
        await this.lachesis.updateBehodler(this.regularToken.address, { from: owner })
        await this.lachesis.updateBehodler(this.burnableToken.address, { from: owner })
    })

    it('borrows scx from behodler and immediately pays it back with open arbiter', async function () {
        this.timeout(500000);
        await this.behodler.grantFlashLoan(10000, this.inertFlashLoanReceiver.address, { from: trader1 });
    })

    it('tries to borrow scx from rejection arbiter fails', async function () {
        this.timeout(500000);
        await this.behodler.seed(this.weth.address, this.lachesis.address, this.rejectionArbiter.address, this.liquidityReceiver.address, weiDaiReserve, this.dai.address, { from: owner })
        await expectRevert(this.behodler.grantFlashLoan(10000, this.inertFlashLoanReceiver.address, { from: trader1 }), 'BEHODLER: cannot borrow flashloan')
    })

    it("doesn't have enough scx to repay flash loan fails", async function () {
        this.timeout(500000);
        await this.behodler.approve(this.dodgyFlashLoanReceiver.address, 1000, { from: trader1 });
        await expectRevert(this.behodler.grantFlashLoan(10000, this.dodgyFlashLoanReceiver.address, { from: trader1 }), 'BEHODLER: Flashloan repayment failed')
    })
})