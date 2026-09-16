const axios = require("axios");
const zohoConfig = require("../config/zoho");
const logger = require("../utils/logger");

const getAccessToken = async () => {
    const url = `${zohoConfig.accountsUrl}/oauth/v2/token`;

    try {
        const { data } = await axios.post(url, null, {
            params: {
                refresh_token: zohoConfig.refreshToken,
                client_id: zohoConfig.clientId,
                client_secret: zohoConfig.clientSecret,
                grant_type: "refresh_token",
            },
        });

        if (!data.access_token) {
            logger.event("zoho_token_refresh_failed", { data });
            throw new Error("Could not refresh Zoho access token: " + JSON.stringify(data));
        }

        return data.access_token;
    } catch (err) {
        logger.event("zoho_token_refresh_error", {
            status: err.response?.status,
            body: JSON.stringify(err.response?.data),
        });
        throw err;
    }
};

const fetchRawEmployees = async () => {
    const accessToken = await getAccessToken();

    // Exact V1 endpoint verified in Postman
    const url = "https://people.zoho.in/people/api/forms/employee/getRecords";

    try {
        const { data } = await axios.get(url, {
            headers: { 
                Authorization: `Zoho-oauthtoken ${accessToken}`
            },
            params: {
                sIndex: 1,
                limit: 200
            }
        });

        // Parse result payload from Zoho V1 structure
        const records = data?.response?.result || data?.result || [];

        if (data?.response?.status && data?.response?.status !== 0) {
            logger.event("zoho_fetch_employees_failed", { message: data?.response?.message });
            throw new Error("Zoho People API error: " + (data?.response?.message || "Unknown error"));
        }

        return records;
    } catch (err) {
        logger.event("zoho_fetch_employees_error", {
            status: err.response?.status,
            body: JSON.stringify(err.response?.data),
        });
        throw err;
    }
};

module.exports = { fetchRawEmployees };