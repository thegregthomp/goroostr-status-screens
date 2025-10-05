const goroostrApiRoute = process.env.GOROOSTR_ENDPOINT;

export async function getOrders() {
  // Add paginate=false to get all orders (status screens need everything)
  const response = await fetch(`${goroostrApiRoute}/get-status-orders?paginate=false`);
  return await response.json();
}