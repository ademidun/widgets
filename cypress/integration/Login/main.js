import DePayWidgets from '../../../src'
import fetchMock from 'fetch-mock'
import React from 'react'
import ReactDOM from 'react-dom'
import { mock, resetMocks } from '@depay/web3-mock'

describe('Wallet Login', () => {

  const blockchain = 'ethereum'
  const accounts = ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']
  beforeEach(resetMocks)
  beforeEach(()=>fetchMock.restore())

  it('prompts message signature and asks wallet to sign it for login purposes', () => {
    let message = "Sign to login"
    let rawSignature = "0x123456"
    let loginRequestMock = fetchMock.post({
      url: "/login",
      body: {
        message,
        signature: rawSignature
      }
    }, accounts[0])

    cy.document().then(async (document)=>{
      let accountLoggedIn
      mock({
        blockchain,
        accounts: { return: accounts },
        signature: {
          params: [accounts[0], "0x5369676e20746f206c6f67696e"],
          return: rawSignature
        }
      })
      DePayWidgets.Login({ document, message}).then((account)=>{
        accountLoggedIn = account
      })
      cy.wait(1000).then(()=>{
        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Log in').click()
        cy.wait(1000).then(()=>{
          expect(accountLoggedIn).to.eq(accounts[0])
        })
      })
    })
  })

  it('allows to set an endpoint for signature recovery', ()=> {
    let message = "Sign to login"
    let rawSignature = "0x123456"
    let loginRequestMock = fetchMock.post({
      url: "https://example.com/login",
      body: {
        message,
        signature: rawSignature
      }
    }, accounts[0])

    cy.document().then(async (document)=>{
      let accountLoggedIn
      mock({
        blockchain,
        accounts: { return: accounts },
        signature: {
          params: [accounts[0], "0x5369676e20746f206c6f67696e"],
          return: rawSignature
        }
      })
      DePayWidgets.Login({ document, message, endpoint: 'https://example.com/login' }).then((account)=>{
        accountLoggedIn = account
      })
      cy.wait(1000).then(()=>{
        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Log in').click()
        cy.wait(1000).then(()=>{
          expect(accountLoggedIn).to.eq(accounts[0])
        })
      })
    })
  })

  it('allows to pass a recover method that performs the request for signature recovery', ()=> {
    let message = "Sign to login"
    let rawSignature = "0x123456"
    let loginRequestMock = fetchMock.post({
      url: "https://example.com/login",
      body: {
        message,
        signature: rawSignature
      }
    }, accounts[0])

    cy.document().then(async (document)=>{
      let accountLoggedIn
      mock({
        blockchain,
        accounts: { return: accounts },
        signature: {
          params: [accounts[0], "0x5369676e20746f206c6f67696e"],
          return: rawSignature
        }
      })
      DePayWidgets.Login({ document, message, recover: ({ message, signature })=>{
        return new Promise((resolve, reject)=>{
          fetch('https://example.com/login', {
            method: 'POST',
            body: JSON.stringify({ message, signature })
          })
            .then((response)=>{
              if(response.status == 200) {
                response.text().then((account)=>{
                  resolve(account)
                }).catch(reject)
              } else {
                response.text().then((text)=>{
                  reject(text || 'Recovering login signature failed!')
                })
              }
            })
        })
      }}).then((account)=>{
        accountLoggedIn = account
      })
      cy.wait(1000).then(()=>{
        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Log in').click()
        cy.wait(1000).then(()=>{
          expect(accountLoggedIn).to.eq(accounts[0])
        })
      })
    })
  })

  describe('errors', ()=>{

    it('shows an error screen if an error occures during login', ()=> {
      let message = "Sign to login"
      let rawSignature = "0x123456"
      let loginRequestMock = fetchMock.post({
        url: "/login",
        body: {
          message,
          signature: rawSignature
        }
      }, 502)

      cy.document().then(async (document)=>{
        let accountLoggedIn
        mock({
          blockchain,
          accounts: { return: accounts },
          signature: {
            params: [accounts[0], "0x5369676e20746f206c6f67696e"],
            return: rawSignature
          }
        })
        DePayWidgets.Login({ document, message}).then((account)=>{
          accountLoggedIn = account
        })
        cy.wait(1000).then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Log in').click()
          cy.wait(1000).then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('h1', 'Oops, Something Went Wrong')
            cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ErrorSnippetText', 'Recovering login signature failed!')  
            cy.wait(1000).then(()=>{
              cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Try again').click()
            })
          })
        })
      })      
    })
  })
})
