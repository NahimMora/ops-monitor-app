from monitor_agent.sanitizer import looks_like_secret_line, redact, redact_known_secrets


def test_redacts_key_value_secrets():
    assert redact('API_KEY=sk-1234567890abcdef') == 'API_KEY=[REDACTED]'
    assert redact('password: "hunter2hunter2"') == 'password=[REDACTED]'


def test_redacts_bearer_tokens():
    out = redact("Authorization header was Bearer abc.def-123_456")
    assert "Bearer [REDACTED]" in out
    assert "abc.def-123_456" not in out


def test_leaves_normal_text_alone():
    text = "Scraping finished: 12 items processed in 4.2s"
    assert redact(text) == text


def test_redact_known_secrets_replaces_literal_values():
    text = "connecting with token wJalrXUtnFEMI/K7MDENG"
    out = redact_known_secrets(text, ["wJalrXUtnFEMI/K7MDENG"])
    assert "wJalrXUtnFEMI/K7MDENG" not in out
    assert "[REDACTED]" in out


def test_looks_like_secret_line():
    assert looks_like_secret_line("SECRET_TOKEN=abcdef123456")
    assert not looks_like_secret_line("cycle finished successfully")
