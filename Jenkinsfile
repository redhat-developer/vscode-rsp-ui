#!/usr/bin/env groovy

node('rhel8'){
	stage('Checkout repo') {
		deleteDir()
		git url: "https://github.com/${params.FORK}/vscode-rsp-ui.git", branch: params.BRANCH
	}

	stage('Install requirements') {
		def nodeHome = tool 'nodejs-lts'
		env.PATH="${env.PATH}:${nodeHome}/bin"
		sh "npm install --force -g typescript vsce"
	}

	stage('Build') {
		sh "npm install"
		if(publishToMarketPlace.equals('false')) {
			def baseUrl = "https://download.jboss.org/jbosstools/adapters/snapshots/vscode-middleware-tools"
			sh "wget ${baseUrl}/vscode-server-connector-api/vscode-server-connector-api-latest.tgz"
			sh "wget ${baseUrl}/rsp-client/rsp-client-latest.tgz"
			sh "npm install vscode-server-connector-api-latest.tgz rsp-client-latest.tgz"
		}
		sh "npm run build"
	}

    	stage('Run Unit Test && UI Tests & Codecov') {
		wrap([$class: 'Xvnc']) {
		    try {
		        sh "npm test --silent"
		        sh "npm run ui-test"
		    } finally {
		        junit 'test-resources/test-report.xml'
		        archiveArtifacts artifacts: 'test-resources/**/*.xml, test-resources/**/*.png, test-resources/*.log, **/*.log, **/*.png'
		    }
		}
	}

	stage('Package') {
		try {
			def packageJson = readJSON file: 'package.json'
			sh "vsce package -o rsp-ui-${packageJson.version}-${env.BUILD_NUMBER}.vsix"
		}
		finally {
			archiveArtifacts artifacts: '*.vsix'
		}
	}
	if(params.UPLOAD_LOCATION) {
		stage('Snapshot') {
			def filesToPush = findFiles(glob: '**.vsix')
			sh "sftp -C ${UPLOAD_LOCATION}/snapshots/vscode-middleware-tools/rsp-ui/ <<< \$'put -p  ${filesToPush[0].path}'"
		}
	}
	// Open-VSX Marketplace
	if (publishToOVSX.equals('true')) {
		timeout(time:5, unit:'DAYS') {
			input message:'Approve deployment to OVSX?', submitter: 'rstryker'
		}

		withCredentials([[$class: 'StringBinding', credentialsId: 'open-vsx-access-token', variable: 'OVSX_TOKEN']]) {
			def vsix = findFiles(glob: '**.vsix')
			sh 'ovsx publish -p ${OVSX_TOKEN} --packagePath ' + " ${vsix[0].path}"
		}
	}
	
	if(publishToMarketPlace.equals('true')){
		timeout(time:5, unit:'DAYS') {
			input message:'Approve deployment?', submitter: 'rstryker'
		}

		stage("Publish to Marketplace") {
			withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_java_marketplace', variable: 'TOKEN']]) {
				def vsix = findFiles(glob: '**.vsix')
				sh 'vsce publish -p ${TOKEN} --packagePath' + " ${vsix[0].path}"
			}
			archive includes:"**.vsix"
		}

		stage("Promote the build to stable") {
			def vsix = findFiles(glob: '**.vsix')
			sh "sftp -C ${UPLOAD_LOCATION}/stable/vscode-middleware-tools/rsp-ui/ <<< \$'put -p ${vsix[0].path}'"
		}
	}
}

