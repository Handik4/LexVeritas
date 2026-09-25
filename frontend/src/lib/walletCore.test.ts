import { describe, expect, it } from 'vitest'
import { CHAIN_ID, CHAIN_ID_HEX, STUDIO_CHAIN_PARAMS, connectInjectedProvider, ensureStudioChain, parseChainId, type Eip1193 } from './walletCore'

/** A MetaMask-like provider that records calls. */
function mockWallet(opts: { chain: string; knowsStudio: boolean; rejectSwitch?: boolean; accounts?: string[] }) {
  const calls: string[] = []
  let chain = opts.chain
  let known = opts.knowsStudio
  const eth: Eip1193 = {
    async request({ method, params }) {
      calls.push(method)
      switch (method) {
        case 'eth_chainId':
          return chain
        case 'eth_requestAccounts':
          return opts.accounts ?? ['0x5C9a4e7FAecfb52E7b29De450CA07D09623DbB5a']
        case 'wallet_switchEthereumChain': {
          if (opts.rejectSwitch) throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
          if (!known) throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 })
          chain = (params as { chainId: string }[])[0].chainId
          return null
        }
        case 'wallet_addEthereumChain':
          expect(params).toEqual([STUDIO_CHAIN_PARAMS])
          known = true
          chain = CHAIN_ID_HEX
          return null
      }
      throw new Error(`unexpected ${method}`)
    },
  }
  return { eth, calls, chain: () => chain }
}

describe('Studio Next chain handshake', () => {
  it('targets chain 61997', () => {
    expect(CHAIN_ID).toBe(61997)
    expect(CHAIN_ID_HEX).toBe('0xf22d')
    expect(STUDIO_CHAIN_PARAMS.nativeCurrency).toEqual({ name: 'GEN', symbol: 'GEN', decimals: 18 })
  })

  it('does nothing when the wallet is already on Studio Next', async () => {
    const w = mockWallet({ chain: CHAIN_ID_HEX, knowsStudio: true })
    await ensureStudioChain(w.eth)
    expect(w.calls).toEqual(['eth_chainId'])
  })

  it('switches when the wallet knows the chain', async () => {
    const w = mockWallet({ chain: '0x1', knowsStudio: true })
    await ensureStudioChain(w.eth)
    expect(w.calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain'])
    expect(w.chain()).toBe(CHAIN_ID_HEX)
  })

  it('adds the chain when the wallet reports 4902 (unsupported network)', async () => {
    const w = mockWallet({ chain: '0x1', knowsStudio: false })
    await ensureStudioChain(w.eth)
    expect(w.calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'])
    expect(w.chain()).toBe(CHAIN_ID_HEX)
  })

  it('surfaces a user rejection instead of adding the chain', async () => {
    const w = mockWallet({ chain: '0x1', knowsStudio: true, rejectSwitch: true })
    await expect(ensureStudioChain(w.eth)).rejects.toMatchObject({ code: 4001 })
    expect(w.calls).not.toContain('wallet_addEthereumChain')
  })

  it('connect requests accounts first, then moves the wallet to Studio Next', async () => {
    const w = mockWallet({ chain: '0x89', knowsStudio: false })
    const address = await connectInjectedProvider(w.eth)
    expect(address).toBe('0x5C9a4e7FAecfb52E7b29De450CA07D09623DbB5a')
    expect(w.calls[0]).toBe('eth_requestAccounts')
    expect(w.chain()).toBe(CHAIN_ID_HEX)
  })

  it('rejects a wallet that returns no accounts', async () => {
    const w = mockWallet({ chain: CHAIN_ID_HEX, knowsStudio: true, accounts: [] })
    await expect(connectInjectedProvider(w.eth)).rejects.toThrow('no accounts')
  })
})

describe('parseChainId', () => {
  it.each([
    ['0xf22d', 61997],
    ['61997', 61997],
    [61997, 61997],
    ['', null],
    [undefined, null],
    ['0xzz', null],
  ])('%s -> %s', (raw, expected) => expect(parseChainId(raw)).toBe(expected))
})
