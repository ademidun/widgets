import ConfigurationContext from '../contexts/ConfigurationContext'
import ErrorContext from '../contexts/ErrorContext'
import PaymentContext from '../contexts/PaymentContext'
import PaymentValueContext from '../contexts/PaymentValueContext'
import React, { useState, useEffect, useContext } from 'react'
import UpdatableContext from '../contexts/UpdatableContext'
import WalletContext from '../contexts/WalletContext'
import { CONSTANTS } from '@depay/web3-constants'
import { Currency } from '@depay/local-currency'
import { ethers } from 'ethers'
import { route } from '@depay/web3-exchanges'
import { Token } from '@depay/web3-tokens'

export default (props)=>{

  const { setError } = useContext(ErrorContext)
  const { account } = useContext(WalletContext)
  const { updatable } = useContext(UpdatableContext)
  const { payment } = useContext(PaymentContext)
  const [ paymentValue, setPaymentValue ] = useState()
  const [ paymentValueLoss, setPaymentValueLoss ] = useState()
  const { currency } = useContext(ConfigurationContext)
  const [ reloadCount, setReloadCount ] = useState(0)
  
  const updatePaymentValue = ({ updatable, payment })=>{
    if(updatable == false || payment?.route == undefined) { return }
    Promise.all([
      route({
        blockchain: payment.route.blockchain,
        tokenIn: payment.route.toToken.address,
        tokenOut: CONSTANTS[payment.route.blockchain].USD,
        amountIn: payment.route.toAmount,
        fromAddress: account,
        toAddress: account
      }),
      !payment.route.directTransfer ? route({
        blockchain: payment.route.blockchain,
        tokenIn: payment.route.toToken.address,
        tokenOut: payment.route.fromToken.address,
        amountIn: payment.route.toAmount,
        fromAddress: account,
        toAddress: account
      }) : Promise.resolve([]),
      (new Token({ blockchain: payment.route.blockchain, address: CONSTANTS[payment.route.blockchain].USD })).decimals()
    ]).then(([toTokenUSDExchangeRoutes, reverseRoutes, USDDecimals])=>{
      let toTokenUSDRoute = toTokenUSDExchangeRoutes[0]
      let reverseRoute = reverseRoutes[0]

      if(reverseRoute) {
        let reverseAmountOutBN = ethers.BigNumber.from(reverseRoute.amountOut)
        let paymentAmountInBN = ethers.BigNumber.from(payment.route.fromAmount)
        let divPercent = 100-reverseAmountOutBN.mul(ethers.BigNumber.from('100')).div(paymentAmountInBN).abs().toString()
        if(divPercent >= 10) {
          setPaymentValueLoss(divPercent)
        } else {
          setPaymentValueLoss(null)
        }
      }

      let toTokenUSDAmount
      if(payment.route.toToken.address.toLowerCase() == CONSTANTS[payment.route.blockchain].USD.toLowerCase()) {
        toTokenUSDAmount = payment.route.toAmount.toString()
      } else if (toTokenUSDRoute == undefined) {
        setPaymentValue('')
        return
      } else {
        toTokenUSDAmount = toTokenUSDRoute.amountOut.toString()
      }

      let toTokenUSDValue = ethers.utils.formatUnits(toTokenUSDAmount, USDDecimals)
      Currency.fromUSD({ amount: toTokenUSDValue, code: currency })
        .then(setPaymentValue)
    }).catch(setError)
  }
  
  useEffect(()=>{
    if(account && payment) { updatePaymentValue({ updatable, payment }) }
  }, [payment, account])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setReloadCount(reloadCount + 1)
      updatePaymentValue({ updatable })
    }, 15000);

    return () => clearTimeout(timeout)
  }, [reloadCount, updatable])
  
  return(
    <PaymentValueContext.Provider value={{
      paymentValue,
      paymentValueLoss
    }}>
      { props.children }
    </PaymentValueContext.Provider>
  )
}
