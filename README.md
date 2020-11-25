# behodler2
Behodler Second Edition.

## Changes from version 1
Behodler 1 demonstrated the utility of omnischedule token bonding curves in creating an AMM. The bonding token, Scarcity became a medium of exchange to facilitate trading. In Behodler2, the basic principles remain and Scarcity still plays the same role. However, computationally expensive algorithms such as square root calculations are no longer performed on chain. The entire calculation of the bonding curve movement is left to the calling client. Behodler simply validates the calculations were correctly performed which is computationally much cheaper. This system of Invariant Analysis is akin to the assymetry present in proof of work where calculating the correct hash is very expensive but validating is cheap. 
The process of trading has been simplified into the exchange equation:

```
Let b be the burn fee, a ratio. Let F = 1-b
_f signifies final balance of a token held in Behodler at the end of a trade. _i signifies initial balance of the token.
I is input token and O is for output token.
So I_f is the final balance of input token.
The exchange equation is then:

√F(√I_f - √I_i) = (√O_i - √O_f)/(F)
```
Because fees are levied on both Scarcity and Input in the implementation, the presence of F on both sides of the equation is not simplified.

## Pyrotokens
Implicit in the exchange equation is that input tokens are burnt. For tokens that cannot be burnt such as Eth or standard ERC20s, the fee set aside for burning is sent into the reserve pool for their corresponding Pyrotoken. Behodler 1 also had Pyrotokens but these were implemented in a gas heavy manner and so were later stripped out. Behodler 2 Pyrotokens come with a number of optimizations.

### How Pyrotokens work
Suppose we have the Basic Attention Token, BAT. We deploy a wrapper token PyroBAT. PyroBAT wraps BAT similarly to how Weth wraps Eth. There is an algorithmically defined redeem rate used to calculate how much PyroBAT is minted for every unit of BAT. Suppose the redeem rate is 1. Then if you send 1 BAT to PyroBAT, you receive 1 PyroBAT. The BAT you sent is then held in reserve. If someone later redeems a PyroBAT, they receive 1 BAT.

The redeem rate is calculated as balance_of_reserve_token/supply_of_pyrotoken

For instance, if there are 1000 BAT held in reserve and 100 PyroBAT circulating then the redeem rate is 1000/100 = 10. This means if I purchase 1 PyroBAT, I require 10 BAT. similarly if I redeem 4 PyroBAT, I will receive 40 BAT.

There are 2 ways the redeem rate can change:
1. burning Pyrotokens reduces supply (demoninator)
2. Adding reserve tokens without minting Pyrotokens (numerator)

On every trade of a token in Behodler, a small fee is levied on input and sent to its corresponding Pyrotoken reserve, thereby instantly increasing the redeem rate. The exceptions are for tokens that can burn such as WeiDai and Eye. These tokens are simply burnt on trades.

When pyrotokens are redeemed, a 2% exit fee is burnt, thereby pushing up the redeem rate for remaining holders. The exit fee means that if a token is ever loses popularity and is dumped, those dumping the pyro equivalent will increase the value, thereby stemming the losses. Pyrotokens are dump resistant. 

Finally, transfers of Pyrotokens burn 0.1%. This is to allow high holders to benefit from frequency bot traders. 

Those who wish to hold a long position on a token smay wish to rather mint the Pyro version since the redeem rate can never fall but because of regular trading on Behodler and exit fees will always grow.


## Flash loans
Behodler 2 comes with flash loans. There are two distinct differences from other flash loan offerings. Firstly, there is no fee charged on a loan. Instead a borrower is simply required to fulfil a condition at the start of the transaction. The condition is open ended and left to the DAO to decide. An example condition could be "does user currently own 1000 Scarcity and 10000 Eye?" or "is the user currently mining liquidity on Behodler?" Such conditions would create incentives for borrowers to indirectly strengthen the system. 
At first there will be no condition. Anyone will be able to borrow. However, the current plan is to mint fash loan NFTs which can be sold on a platform like Opensea. Only holders of the NFT can then take out a flash loan. This approach insulates flash loans on Behodler from front running since it is unlikely that the current miner also has the NFT. The minting of NFTs for flash loans will provide a ready source of income for the MorgothDAO.
Secondly, the flashloans will only be issued in Scarcity, not the underlying tokens. This allows the borrower to mint any quantity of scarcity they desire, even if it doesn't currently exist. The snag is that they have to find a way to pay it back by the end of the transaction. 

Because Scarcity and Behodler are part of the same contract, there is no need for ERC20 approve or any other ERC20 housecleaning, saving a great deal on redundant gas usage.