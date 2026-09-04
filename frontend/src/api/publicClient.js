import axios from "axios";

const BASE_URL =
    import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";

const publicClient = axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: {
        "Content-Type": "application/json",
    },
});

publicClient.interceptors.response.use(
    (response) => response.data,

    (error) => {
        if (!error.response) {
            return Promise.reject({
                status: 0,
                message:
                    error.code === "ECONNABORTED"
                        ? "The server took too long to respond. Please try again."
                        : "Cannot reach the server. Check that the API is running.",
                errors: null,
            });
        }

        const { status, data } = error.response;

        return Promise.reject({
            status,
            message:
                data?.message ||
                "Something went wrong. Please try again.",
            errors: data?.errors || null,
        });
    }
);

export default publicClient;