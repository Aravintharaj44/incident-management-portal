module.exports = {
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in",
    apiDomain: process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in",
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
};