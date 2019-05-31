
BUILD_DIR := build
CODE_DOCS_DIR := ./code_docs
COVERAGE_DIR := ./code_coverage
COVERAGE_FILE := .coverage
DIST_DIR := dist

build:
	echo "Creating package artifacts"
	bash scripts/build_rpm.sh
unit_test:
	echo "Running unit tests";
	npm run test
lint:
	echo "Running linter (any error will result in non-zero exit code)";
	npm run lint
coverage: 
	unit_test
	echo "Generating code coverage documentation"
	npm run report
code_docs:
	echo "Generating code documentation"
clean:
	echo "Removing artifacts"
	rm -rf ${BUILD_DIR}
	rm -rf ${CODE_DOCS_DIR}
	rm -rf ${COVERAGE_DIR}
	rm -rf ${COVERAGE_FILE}
	rm -rf ${DIST_DIR}
.PHONY: clean
