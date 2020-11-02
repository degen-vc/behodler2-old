// test/Box.test.js

// Load dependencies
const { accounts, contract } = require('@openzeppelin/test-environment');
const { BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

// Load compiled artifacts
const Lachesis = contract.fromArtifact('Lachesis');
const mockToken1 = contract.fromArtifact('MockToken1')

// Start test block
describe('Lachesis', function () {
    const [owner, notOwner] = accounts;

    beforeEach(async function () {
        // Deploy a new Box contract for,  each test
        this.lachesis = await Lachesis.new({ from: owner });
        this.mockToken = await mockToken1.new({ from: owner })
    });

    it('failes to measure when non admin attempts', async function () {
        await expectRevert(this.lachesis.measure(this.mockToken.address, false, false, { from: notOwner }), "Ownable: caller is not the owner")
    });

    it('sets token, inverts properties and resets as owner', async function () {
        let result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': false, '1': false })

        await this.lachesis.measure(this.mockToken.address, true, false, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': true, '1': false })

        await this.lachesis.measure(this.mockToken.address, false, true, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': false, '1': true })

        await this.lachesis.measure(this.mockToken.address, true, true, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': true, '1': true })

        await this.lachesis.measure(this.mockToken.address, false, false, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': false, '1': false })
    })
});