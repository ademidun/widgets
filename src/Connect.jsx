import ClosableProvider from './providers/ClosableProvider'
import ConnectStack from './stacks/ConnectStack'
import ensureDocument from './helpers/ensureDocument'
import ErrorProvider from './providers/ErrorProvider'
import mount from './helpers/mount'
import PoweredBy from './components/PoweredBy'
import React from 'react'
import requireReactVersion from './helpers/requireReactVersion'
import UpdatableProvider from './providers/UpdatableProvider'
import { getWallet } from '@depay/web3-wallets'

let Connect = (options) => {
  requireReactVersion()
  let style, error, document
  if(typeof options == 'object') ({ style, error, document } = options)

  return new Promise(async (resolve, reject)=>{

    let wallet = getWallet()
    if(wallet) {
      let accounts = await wallet.accounts()
      if(accounts instanceof Array && accounts.length > 0) {
        return resolve({ wallet, accounts, account: accounts[0] })
      }
    }

    let unmount = mount({ style, document: ensureDocument(document) }, (unmount)=> {
      const rejectBeforeUnmount = ()=>{
        reject('USER_CLOSED_DIALOG')
        unmount()
      }
      return (container)=>
        <ErrorProvider errorCallback={ error } container={ container } unmount={ unmount }>
          <UpdatableProvider>
            <ClosableProvider unmount={ rejectBeforeUnmount }>
              <ConnectStack
                document={ document }
                container={ container }
                resolve={ resolve }
                reject={ reject }
                autoClose={ true }
              />
              <PoweredBy/>
            </ClosableProvider>
          </UpdatableProvider>
        </ErrorProvider>
    })
  })
}

export default Connect
