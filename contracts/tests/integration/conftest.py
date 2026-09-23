def pytest_configure(config):
    config.addinivalue_line("markers", "slow: full-consensus tests using real web/LLM calls, excluded by default")
