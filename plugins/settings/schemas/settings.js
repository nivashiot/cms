const COOKIE_OPTIONS = { security: 'strict', httponly: true };

NEWSCHEMA('SettingsKeyValue', function(schema) {
	schema.define('id', 'String(50)', true);
	schema.define('name', 'String(50)', true);
});

NEWSCHEMA('Settings/SuperUser', function(schema) {
	schema.define('id', 'String(15)');
	schema.define('name', String, true);
	schema.define('login', String, true);
	schema.define('password', String, true);
	schema.define('roles', '[String]');
	schema.define('sa', Boolean);
});

NEWSCHEMA('Settings', function(schema) {

	schema.define('name', 'String(50)', true);
	schema.define('author', 'String(50)');
	schema.define('emailcontactform', 'Email', true);
	schema.define('emailreply', 'Email', true);
	schema.define('emailsender', 'Email', true);
	schema.define('url', 'Url', true);
	schema.define('users', '[Settings/SuperUser]');
	schema.define('signals', '[SettingsKeyValue]');
	schema.define('languages', '[SettingsKeyValue]');
	schema.define('smtp', String);
	schema.define('smtpoptions', 'JSON');
	schema.define('componentator', Boolean);
	schema.define('cookie', 'String(30)', true);
	schema.define('cdn', String, true);

	schema.setGet(function($) {
		$.callback(PREF);
	});

	// Saves settings into the file
	schema.setSave(function($) {

		var model = $.clean();
		var keys = Object.keys(model);

		if (model.url.endsWith('/'))
			model.url = model.url.substring(0, model.url.length - 1);

		for (var i = 0; i < model.users.length; i++) {
			var usr = model.users[i];
			if (usr.password[0] === '#')
				usr.password = usr.password.substring(1).sha256(CONF.admin_secret);
		}

		for (var i = 0; i < keys.length; i++)
			PREF.set(keys[i], model[keys[i]]);

		model.dtbackup = NOW;
		NOSQL('settings_backup').insert(JSON.parse(JSON.stringify(model)));
		model.dtbackup = undefined;

		EMIT('settings.save', PREF);
		$SAVE('Events', { type: 'settings', id: model.id, user: $.user.name, admin: true }, NOOP, $);
		$.success();
	});

	schema.addHook('dependencies', function($) {

		var obj = $.model;
		var keys = Object.keys(obj);

		// Clean default values in model
		for (var i = 0; i < keys.length; i++)
			obj[keys[i]] = undefined;

		obj.navigations = PREF.navigations;
		obj.signals = PREF.signals;
		obj.templatespages = PREF.templates;
		obj.templatesposts = PREF.templatesposts;
		obj.templatesnewsletters = PREF.templatesnewsletters;
		obj.notices = PREF.notices;
		obj.languages = PREF.languages || EMPTYARRAY;
		$.callback();
	});

	// Tests SMTP
	schema.addWorkflow('smtp', function($) {
		var model = $.model;
		if (model.smtp)
			Mail.use(model.smtp, model.smtpoptions ? model.smtpoptions.parseJSON() : '', err => err ? $.invalid(err) : $.success());
		else
			$.success();
	});

	// Loads settings + rewrites framework configuration
	schema.addWorkflow('load', function($) {

		if (!PREF.url)
			PREF.url = 'http://{0}:{1}'.format(F.ip, F.port);

		if (PREF.componentator == null)
			PREF.componentator = true;

		if (!PREF.cdn)
			PREF.cdn = '//cdn.componentator.com';

		CONF.url = PREF.url;
		MAIN.users = [];

		if (!PREF.cookie)
			PREF.cookie = '__admin';

		CONF.admin_cookie = PREF.cookie;

		// Refreshes internal informations
		if (PREF.users && PREF.users.length)
			MAIN.users.push.apply(MAIN.users, PREF.users);

		// Adds an admin (service) account
		if (!MAIN.users.length) {
			var pwd = GUID(10);
			MAIN.users.push({ id: GUID(15), name: 'Administrator', login: GUID(10), password: pwd.sha256(CONF.admin_secret), roles: [], sa: true, passwordinit: pwd });
			PREF.set('users', MAIN.users);
			PREF.set('usersinitialized', false);
		}

		// Optimized for the performance
		var users = {};
		for (var i = 0, length = MAIN.users.length; i < length; i++) {
			var user = MAIN.users[i];
			var key = (user.login + ':' + user.password + ':' + CONF.secret + (user.login + ':' + user.password).hash()).sha256(CONF.admin_secret);
			if ($.controller && $.user.id === user.id)
				$.cookie(CONF.admin_cookie, key, '1 month', COOKIE_OPTIONS);
			users[key] = user;
		}

		MAIN.users = users;

		if (PREF.name)
			CONF.name = PREF.name;

		if (PREF.author)
			CONF.author = PREF.author;

		// Rewrites internal framework settings
		CONF.mail_address_from = PREF.emailsender;
		CONF.mail_address_reply = PREF.emailreply;
		CONF.cdn = PREF.cdn;

		!PREF.signals && PREF.set('signals', []);
		!PREF.languages && PREF.set('languages', []);
		!PREF.navigations && PREF.set('navigations', {});
		!PREF.templatespages && PREF.set('templates', []);
		!PREF.templatesposts && PREF.set('templatesposts', []);
		!PREF.templatesnewsletters && PREF.set('templatesnewsletters', []);
		!PREF.posts && PREF.set('posts', []);
		!PREF.notices && PREF.set('notices', []);

		PREF.smtp && Mail.use(PREF.smtp, PREF.smtpoptions.parseJSON());

		EMIT('settings', PREF);
		$.success();
	});
});

setTimeout(function() {
	$WORKFLOW('Settings', 'load');
}, 500);