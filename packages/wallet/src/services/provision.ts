export const provisionMockMpcWallet = async (userId: string) => {
  // Deterministic mock generation
  const mockAddress = `0x${Buffer.from(userId).toString('hex').slice(0, 40)}`;
  return {
    address: mockAddress,
    chainId: '1',
  };
};
