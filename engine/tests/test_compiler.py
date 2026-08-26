from app.calle_schema import assert_calle_schema_subset
from app.compiler import compile_workflow
from app.models.campaign import Contact
from app.sample_workflow import SAMPLE_WORKFLOW


def _contact() -> Contact:
    return Contact(id="c1", name="Jordan Lee", phoneNumber="+15551234567", metadata={"source": "web form"})


def test_compile_produces_a_calle_schema_valid_request():
    request = compile_workflow(
        SAMPLE_WORKFLOW, "campaign-1", _contact(), "https://example.com/api/calle/webhook"
    )
    assert_calle_schema_subset(request.result_schema)  # raises if invalid
    assert request.metadata == {"campaignId": "campaign-1", "contactId": "c1"}
    assert request.webhook_url == "https://example.com/api/calle/webhook"


def test_task_mentions_contact_name_and_metadata():
    request = compile_workflow(
        SAMPLE_WORKFLOW, "campaign-1", _contact(), "https://example.com/api/calle/webhook"
    )
    assert "Jordan Lee" in request.task
    assert "web form" in request.task


def test_task_renders_branch_conditions():
    request = compile_workflow(
        SAMPLE_WORKFLOW, "campaign-1", _contact(), "https://example.com/api/calle/webhook"
    )
    assert '"Yes"' in request.task
    assert '"Qualified"' in request.task


def test_task_keeps_main_line_together_before_short_circuit_branch():
    request = compile_workflow(
        SAMPLE_WORKFLOW, "campaign-1", _contact(), "https://example.com/api/calle/webhook"
    )
    task = request.task
    # "Send Info" is reachable early via the consent "No" branch — it is *mentioned*
    # there as a branch target — but its own step (identified by its unique say text,
    # since its label also appears in that earlier branch mention) must come after the
    # main qualification line, not interleaved into the middle of it.
    send_info_step = task.index("I will email our overview")
    assert task.index("Financial Goal?") < task.index("Investment Horizon")
    assert task.index("Investment Horizon") < task.index("Risk Tolerance")
    assert task.index("Risk Tolerance") < task.index("Qualification:")
    assert task.index("Qualification:") < send_info_step


def test_task_formats_numbers_and_lists_without_artifacts():
    request = compile_workflow(
        SAMPLE_WORKFLOW, "campaign-1", _contact(), "https://example.com/api/calle/webhook"
    )
    task = request.task
    assert "one of one of" not in task
    assert "5.0" not in task
    assert "3.0 points" not in task
    assert "is one of balanced, growth" in task


def test_result_schema_includes_next_step_enum():
    request = compile_workflow(
        SAMPLE_WORKFLOW, "campaign-1", _contact(), "https://example.com/api/calle/webhook"
    )
    next_step = request.result_schema["properties"]["next_step"]
    assert next_step["enum"] == SAMPLE_WORKFLOW.outcome_schema.next_step
    assert "next_step" in request.result_schema["required"]
