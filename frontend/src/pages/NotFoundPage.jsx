import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";

const NotFoundPage = () => {
    const navigate = useNavigate();

    return (
        <Result
            status="404"
            title="404"
            subTitle="That page does not exist."
            extra={
                <Button type="primary" onClick={() => navigate("/dashboard")}>
                    Back to dashboard
                </Button>
            }
        />
    );
};

export default NotFoundPage;
