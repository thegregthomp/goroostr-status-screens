const goroostrApiRoute = process.env.GOROOSTR_ENDPOINT;

export async function getOrders() {
  const response = await fetch(`${goroostrApiRoute}/get-status-orders`);
  return await response.json();
}