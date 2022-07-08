import * as idbKeyval from "/js/external/idb-keyval.js";
import * as DataManager from "/js/data-manager.js";
import * as NotificationManager from "/js/notification-manager.js";

var mainEl;
var createProfileFormEl;
var loginFormEl;
var savedDataFormEl;
var profileNameSelectorEl;
var profileLabelEl;
var authWorker;
var tmpDataBackup;

document.addEventListener("DOMContentLoaded",() => main().catch(console.log),false);


// ****************************

async function main() {
	mainEl = document.querySelector("main");
	createProfileFormEl = document.getElementById("create-profile");
	loginFormEl = document.getElementById("login");
	savedDataFormEl = document.getElementById("saved-data");
	profileNameSelectorEl = document.getElementById("profile-names");
	profileLabelEl = document.getElementById("profile-label");

	NotificationManager.init(mainEl);

	buttonEventHandlers: {
		let createAnotherProfileBtn = document.getElementById("create-another-profile-btn");
		let logoutBtn = document.getElementById("logout-btn");
		createAnotherProfileBtn.addEventListener("click",switchToRegisterMode,false);
		logoutBtn.addEventListener("click",onLogout,false);

		createProfileFormEl.addEventListener("submit",onCreateProfile,false);
		loginFormEl.addEventListener("submit",onLogin,false);
		savedDataFormEl.addEventListener("submit",onSaveData,false);
	}

	authWorker = new Worker("/js/auth-worker.js");
	authWorker.addEventListener("message",onAuthMessage,false);

	loadProfiles: {
		let profiles = await getProfiles();
		populateProfileSelector(profiles);
	}

	// no registered login(s) yet?
	if (profileNameSelectorEl.options.length == 0) {
		createProfileFormEl.classList.remove("hidden");
	}
	else {
		let accountID = sessionStorage.getItem("current-account-id");
		let keyText = sessionStorage.getItem("current-key-text");

		// already logged in?
		if (accountID && keyText) {
			await populateSavedData();
			savedDataFormEl.classList.remove("hidden");
		}
		else {
			loginFormEl.classList.remove("hidden");
		}
	}
}

function switchToRegisterMode(evt) {
	cancelEvent(evt);

	loginFormEl.classList.add("hidden");
	loginFormEl.reset();
	savedDataFormEl.classList.add("hidden");
	savedDataFormEl.reset();
	createProfileFormEl.reset();
	createProfileFormEl.classList.remove("hidden");
}

async function getProfiles() {
	var profiles = await idbKeyval.get("profiles");
	return profiles || {};
}

async function getAccounts() {
	var accounts = await idbKeyval.get("accounts");
	return accounts || {};
}

async function addProfileAccount(profileName,accountID) {
	var [ profiles, accounts, ] = await Promise.all([
		getProfiles(),
		getAccounts(),
	]);

	if (!(profileName in profiles)) {
		profiles[profileName] = accountID;
		accounts[accountID] = { profileName, };
		try {
			await Promise.all([
				idbKeyval.set("profiles",profiles),
				idbKeyval.set("accounts",accounts),
			]);
			populateProfileSelector(profiles);
			return true;
		}
		catch (err) {}
	}
	return false;
}

function populateProfileSelector(profiles) {
	profileNameSelectorEl.options.length = 0;
	let profileList = Object.entries(profiles).sort((p1,p2) => (
		(p1[0] < p2[0]) ? -1 :
		(p1[0] > p2[0]) ? 1 :
		0
	));

	for (let [ profileName, accountID, ] of profileList) {
		let optEl = document.createElement("option");
		optEl.value = accountID;
		optEl.innerText = profileName;
		profileNameSelectorEl.appendChild(optEl);
	}
}

async function populateSavedData() {
	setProfileName: {
		let accounts = await getAccounts();
		let accountID = sessionStorage.getItem("current-account-id");
		let account = accounts[accountID];
		profileLabelEl.innerText = account.profileName;
	}

	setSavedData: {
		let textareaEl = savedDataFormEl.querySelector("#saved-text");
		let data = await DataManager.getData();
		textareaEl.value = (data != null) ? data : "";
	}
}

async function onCreateProfile(evt) {
	cancelEvent(evt);

	var submitBtn = createProfileFormEl.querySelector("button[type=submit]");

	if (!(
		createProfileFormEl.classList.contains("hidden") ||
		submitBtn.disabled
	)) {
		let profileNameEl = createProfileFormEl.querySelector("#register-profile-name");
		let passphraseEl = createProfileFormEl.querySelector("#register-password");
		let confirmPassphraseEl = createProfileFormEl.querySelector("#register-password-confirm");
		if (profileNameEl.value.length < 2) {
			warn("Please enter a profile name/description at least 2 characters long.");
			return false;
		}
		if (passphraseEl.value.length < 12) {
			warn("Please enter a passphrase at least 12 characters long.");
			return false;
		}
		if (passphraseEl.value !== confirmPassphraseEl.value) {
			warn("Please make sure you enter the exact same passphrase twice.");
			return false;
		}

		let accountID = self.crypto.randomUUID();
		if (!(await addProfileAccount(profileNameEl.value,accountID))) {
			warn("Could not add a profile with the given name/description.");
			return false;
		}

		submitBtn.disabled = true;
		authWorker.postMessage({
			createAuth: {
				password: passphraseEl.value.trim(),
				accountID,
			},
		});
	}
}

async function onLogin(evt) {
	cancelEvent(evt);

	var submitBtn = loginFormEl.querySelector("button[type=submit]");

	if (!(
		loginFormEl.classList.contains("hidden") ||
		submitBtn.disabled
	)) {
		let accountID = profileNameSelectorEl.value;
		let passphraseEl = loginFormEl.querySelector("#login-password");
		let password = passphraseEl.value.trim();

		if (password.length < 12) {
			warn("Please login with a passphrase at least 12 characters long.");
			return false;
		}

		submitBtn.disabled = true;
		authWorker.postMessage({
			checkAuth: {
				password,
				accountID,
			},
		});
	}
}

async function onLogout(evt) {
	cancelEvent(evt);
	NotificationManager.hide();
	createProfileFormEl.reset();
	loginFormEl.reset();
	savedDataFormEl.reset();
	profileLabelEl.innerText = "";
	sessionStorage.clear();
	location.reload();
}

async function onSaveData(evt) {
	cancelEvent(evt);

	var submitBtn = savedDataFormEl.querySelector("button[type=submit]");

	if (!(
		savedDataFormEl.classList.contains("hidden") ||
		submitBtn.disabled
	)) {
		submitBtn.disabled = true;
		let textareaEl = savedDataFormEl.querySelector("#saved-text");
		try {
			let res = await DataManager.saveData(textareaEl.value);
			if (res) {
				notify("Data saved (encrypted) successfully.");
			}
			if (!res) {
				throw res;
			}
		}
		catch (err) {
			console.log(err);
			warn("Saving data failed. Please try again.");
		}

		submitBtn.disabled = false;
	}
}

function hideRegistration() {
	createProfileFormEl.classList.add("hidden");
	createProfileFormEl.reset();
	var submitBtn = createProfileFormEl.querySelector("button[type=submit]");
	submitBtn.disabled = false;
}

function hideLogin() {
	loginFormEl.classList.add("hidden");
	loginFormEl.reset();
	var submitBtn = loginFormEl.querySelector("button[type=submit]");
	submitBtn.disabled = false;
}

function notify(msg,isModal = false) {
	NotificationManager.show(msg,isModal,/*isError=*/false);
}

function warn(msg,isModal = true) {
	NotificationManager.show(msg,isModal,/*isError=*/true);
}

// *******************************

async function onAuthMessage({ data }) {
	if (data.login === true) {
		// upgrade of auth credentials pending?
		if (data.upgradePending) {
			// decrypt/extract current data
			tmpDataBackup = await DataManager.getData(
				data.accountID,
				data.keyText,
			);

			// trigger regeneration of new auth credentials
			authWorker.postMessage({
				createAuth: {
					password: data.password,
					accountID: data.accountID,
					regenerate: true,
				},
			});

			notify("Upgrading data encryption, please wait...");
			return;
		}
		// auth credentials regenerated?
		else if (data.authRegenerated && tmpDataBackup) {
			try {
				// re-save the data using the upgraded
				// encryption credentials
				let res = await DataManager.saveData(
					tmpDataBackup,
					data.accountID,
					data.keyText,
					/*upgrade=*/true
				);
				if (!res) {
					throw "Save failed.";
				}
				tmpDataBackup = null;
			}
			catch (err) {
				console.log(err);
				warn("Re-saving data (during credentials upgrade) failed. Please try again.");

				let submitBtn = loginFormEl.querySelector("button[type=submit]");
				submitBtn.disabled = false;
				return;
			}
		}

		// need to save credentials into session?
		sessionStorage.setItem("current-account-id",data.accountID);
		sessionStorage.setItem("current-key-text",data.keyText);

		NotificationManager.hide();
		hideRegistration();
		hideLogin();
		await populateSavedData();
		savedDataFormEl.classList.remove("hidden");

		if (data.credentialsCreated) {
			notify(
				"Local profile created successfully, you're now logged in!",
				/*isModal=*/true
			);
		}
	}
	else if (data.error) {
		let submitBtns = document.querySelectorAll("form button[type=submit]");
		for (let btn of submitBtns) {
			btn.disabled = false;
		}

		// is the login form active?
		if (!loginFormEl.classList.contains("hidden")) {
			let passphraseEl = loginFormEl.querySelector("#login-password");
			passphraseEl.value = "";
		}

		console.log(data.error);
		warn(data.error);
	}
}
