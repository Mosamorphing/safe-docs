import SafeApiKit from '@safe-global/api-kit'

const apiKit = new SafeApiKit({
  chainId: 1n
})

const safeInfo = await apiKit.getSafeInfo(
  '0x5298A93734C3D979eF1f23F78eBB871879A21F22'
)

console.log(safeInfo)
