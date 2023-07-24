const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, ENVIRONMENT = 'sandbox' } = process.env;
const baseUrl = {
  sandbox: "https://api-m.sandbox.paypal.com",
  production: "https://api-m.paypal.com",
}

// use the oauth2/token api to get an access token
function getPaypalAccessToken() {
  console.log({ 
    PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET,
    ENVIRONMENT,
    baseUrl: baseUrl[ENVIRONMENT],
   })
  return fetch(`${baseUrl[ENVIRONMENT]}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: "grant_type=client_credentials",
  })
  .then((response) => response.json())
  .then((data) => data.access_token);
}


// use the orders api to create an order
async function createOrder(value) {
  // create accessToken using your clientID and clientSecret
  // for the full stack example, please see the Standard Integration guide 
  // https://developer.paypal.com/docs/multiparty/checkout/standard/integrate/
  const accessToken = await getPaypalAccessToken();
  return fetch (`${baseUrl[ENVIRONMENT]}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      "purchase_units": [
        {
          "amount": {
            "currency_code": "USD",
            "value": value,
          },
        }
      ],
      "intent": "CAPTURE",
      "application_context": {
        "return_url": "http://localhost:3000/finalizepayment",
        "cancel_url": "http://localhost:3000/cart"
      }
    })
  })
  .then((response) => response.json());
}

module.exports = {
  createOrder,
};