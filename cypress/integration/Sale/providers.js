import DePayWidgets from '../../../src'
import React from 'react'
import ReactDOM from 'react-dom'
import { provider } from '@depay/web3-client'

describe('Sale Widget: providers', () => {

  it('allows to set RPC providers to use', ()=> {
    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Sale({ document,
          
          providers: {
            ethereum: ['http://localhost:8545'],
            bsc: ['http://localhost:8545']
          },

          sell: { 'ethereum': '0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb' }
        })

        cy.wait(200).then(()=>{
          expect(provider('ethereum').connection.url).to.equal('http://localhost:8545')
          expect(provider('bsc').connection.url).to.equal('http://localhost:8545')
        })
      })
    })
  })
})
