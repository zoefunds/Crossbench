def pytest_configure(config):
    config.addinivalue_line("markers", "slow: full-consensus tests using real web/LLM calls, excluded by default")
    config.addinivalue_line("markers", "deadline: resumes the recorded live lifecycle after its real challenge deadline")
