from fastapi.testclient import TestClient

from app.main import app
from app.sample_workflow import SAMPLE_WORKFLOW

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_validate_sample_workflow():
    response = client.post(
        "/workflows/validate", json={"workflow": SAMPLE_WORKFLOW.model_dump(by_alias=True)}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["errors"] == []


def test_validate_rejects_malformed_workflow():
    response = client.post("/workflows/validate", json={"workflow": {"goal": "x"}})
    assert response.status_code == 422


def test_compile_sample_workflow():
    response = client.post(
        "/workflows/compile",
        json={
            "workflow": SAMPLE_WORKFLOW.model_dump(by_alias=True),
            "campaign_id": "campaign-1",
            "contact": {"id": "c1", "name": "Jordan Lee", "phoneNumber": "+15551234567"},
            "webhook_url": "https://example.com/api/calle/webhook",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["metadata"] == {"campaignId": "campaign-1", "contactId": "c1"}
    assert "Jordan Lee" in body["task"]
    assert body["result_schema"]["type"] == "object"
