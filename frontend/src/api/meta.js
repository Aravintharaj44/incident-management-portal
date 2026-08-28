import axios from "axios";

const BASE_URL = import.meta.env.SVRVER_API_URL || "http://localhost:5000/api/v1";

/**
 * Reference data (status/priority/role labels, SLA targets, upload limits).
 *
 * Uses a bare axios call rather than the shared client because it is public
 * and is fetched before the user has a token.
 */
export const metaApi = {
    get: async () => {
        const { data } = await axios.get(`${BASE_URL}/meta`);
        return data;
    },
};
