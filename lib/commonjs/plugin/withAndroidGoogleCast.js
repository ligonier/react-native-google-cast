"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.withAndroidGoogleCast = void 0;
var _configPlugins = require("@expo/config-plugins");
var _codeMod = require("@expo/config-plugins/build/android/codeMod");
var _generateCode = require("@expo/config-plugins/build/utils/generateCode");
const {
  addMetaDataItemToMainApplication,
  getMainApplicationOrThrow
} = _configPlugins.AndroidConfig.Manifest;
const META_PROVIDER_CLASS = 'com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME';
const META_RECEIVER_APP_ID = 'com.reactnative.googlecast.RECEIVER_APPLICATION_ID';
const MAIN_ACTIVITY_LANGUAGES = {
  java: {
    code: 'CastContext.getSharedInstance(this)',
    anchor: /super\.onCreate\(\w+\)/
  },
  kt: {
    code: 'CastContext.getSharedInstance(this)',
    anchor: /super\.onCreate\(\w+\)/
  }
};
const EXPANDED_CONTROLLER_ACTIVITY = 'com.reactnative.googlecast.RNGCExpandedControllerActivity';
async function ensureExpandedControllerActivity({
  mainApplication
}) {
  if (Array.isArray(mainApplication.activity)) {
    // If the expanded controller activity is already added
    mainApplication.activity = mainApplication.activity.filter(activity => {
      var _activity$$;
      return ((_activity$$ = activity.$) === null || _activity$$ === void 0 ? void 0 : _activity$$['android:name']) !== EXPANDED_CONTROLLER_ACTIVITY;
    });
  } else {
    mainApplication.activity = [];
  }

  // adds `<activity android:name="${EXPANDED_CONTROLLER_ACTIVITY}" />` to the manifest
  mainApplication.activity.push({
    $: {
      'android:name': EXPANDED_CONTROLLER_ACTIVITY
    }
  });
  return mainApplication;
}
const withAndroidManifestCast = (config, {
  expandedController,
  receiverAppId
} = {}) => {
  return (0, _configPlugins.withAndroidManifest)(config, async config_ => {
    const mainApplication = getMainApplicationOrThrow(config_.modResults);
    if (expandedController) {
      ensureExpandedControllerActivity({
        mainApplication
      });
    }
    addMetaDataItemToMainApplication(mainApplication, META_PROVIDER_CLASS,
    // This is the native Java class
    'com.reactnative.googlecast.GoogleCastOptionsProvider');
    if (receiverAppId) {
      addMetaDataItemToMainApplication(mainApplication, META_RECEIVER_APP_ID, receiverAppId);
    }
    return config_;
  });
};
const withProjectBuildGradleVersion = (config, {
  version
}) => {
  return (0, _configPlugins.withProjectBuildGradle)(config, config_ => {
    if (config_.modResults.language !== 'groovy') throw new Error('react-native-google-cast config plugin does not support Kotlin /build.gradle yet.');
    config_.modResults.contents = addGoogleCastVersionImport(config_.modResults.contents, {
      version
    }).contents;
    return config_;
  });
};
const withAppBuildGradleImport = (config, {
  version
}) => {
  return (0, _configPlugins.withAppBuildGradle)(config, config_ => {
    if (config_.modResults.language !== 'groovy') throw new Error('react-native-google-cast config plugin does not support Kotlin app/build.gradle yet.');
    config_.modResults.contents = addSafeExtGet(config_.modResults.contents);
    config_.modResults.contents = addGoogleCastImport(config_.modResults.contents, {
      version
    }).contents;
    return config_;
  });
};
const withMainActivityLazyLoading = config => {
  return (0, _configPlugins.withMainActivity)(config, async config_ => {
    const src = (0, _codeMod.addImports)(config_.modResults.contents, ['com.google.android.gms.cast.framework.CastContext'], config_.modResults.language === 'java');
    config_.modResults.contents = addGoogleCastLazyLoadingImport(src, config_.modResults.language).contents;
    return config_;
  });
};

// castFrameworkVersion
const withAndroidGoogleCast = (config, props) => {
  config = withAndroidManifestCast(config, {
    expandedController: props.expandedController,
    receiverAppId: props.receiverAppId
  });
  config = withMainActivityLazyLoading(config);
  config = withProjectBuildGradleVersion(config, {
    // gradle dep version
    version: props.androidPlayServicesCastFrameworkVersion ?? '+'
  });
  config = withAppBuildGradleImport(config, {
    // gradle dep version
    version: props.androidPlayServicesCastFrameworkVersion ?? '+'
  });
  return config;
};
exports.withAndroidGoogleCast = withAndroidGoogleCast;
function addGoogleCastLazyLoadingImport(src, language) {
  const mainActivity = MAIN_ACTIVITY_LANGUAGES[language];
  if (!mainActivity) {
    throw new Error(`react-native-google-cast config plugin does not support MainActivity.${language} yet`);
  }
  const newSrc = [];
  newSrc.push(`    ${mainActivity.code}`);
  return (0, _generateCode.mergeContents)({
    tag: 'react-native-google-cast-onCreate',
    src,
    newSrc: newSrc.join('\n'),
    anchor: mainActivity.anchor,
    offset: 1,
    comment: '//'
  });
}

// TODO: Add this ability to autolinking
// dependencies { implementation "com.google.android.gms:play-services-cast-framework:+" }
function addGoogleCastImport(src, {
  version
} = {}) {
  const newSrc = [];
  newSrc.push(`    implementation "com.google.android.gms:play-services-cast-framework:\${safeExtGet('castFrameworkVersion', '${version}')}"`);
  return (0, _generateCode.mergeContents)({
    tag: 'react-native-google-cast-dependencies',
    src,
    newSrc: newSrc.join('\n'),
    anchor: /dependencies(?:\s+)?\{/,
    offset: 1,
    comment: '//'
  });
}
function addSafeExtGet(src) {
  const tag = 'safeExtGet';
  src = (0, _generateCode.removeContents)({
    src,
    tag
  }).contents;

  // If the source already has a safeExtGet method after removing this one, then go with the existing one.
  if (src.match(/def(?:\s+)?safeExtGet\(/)) {
    return src;
  }
  // Otherwise add a new one
  const newSrc = [];
  newSrc.push('def safeExtGet(prop, fallback) {', '  rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback', '}');
  return (0, _generateCode.mergeContents)({
    tag: 'safeExtGet',
    src,
    newSrc: newSrc.join('\n'),
    // This block can go anywhere in the upper scope
    anchor: /apply plugin/,
    offset: 1,
    comment: '//'
  }).contents;
}
function addGoogleCastVersionImport(src, {
  version
} = {}) {
  const newSrc = [`        castFrameworkVersion = "${version}"`];
  let hasExtBlock = false;
  try {
    hasExtBlock = Boolean(src.match(/ext(?:\s+)?\{/));
  } catch (e) {
    console.warn(e);
  }
  const anchor = hasExtBlock ? /ext(?:\s+)?\{/ : /buildscript(?:\s+)?\{/;
  if (!hasExtBlock) {
    newSrc.unshift('  ext {');
    newSrc.push('  }');
  }
  return (0, _generateCode.mergeContents)({
    tag: 'react-native-google-cast-version-import',
    src,
    newSrc: newSrc.join('\n'),
    anchor,
    offset: 1,
    comment: '//'
  });
}
//# sourceMappingURL=withAndroidGoogleCast.js.map