export const PLATFORM_ADVICE = [
  {
    patterns: [
      'ANDROID_EXTERNAL_FILE_ACCESS',
      'ANDROID_BROADCAST',
      'ANDROID_WORLD_WRITABLE',
      'ANDROID_GEOLOCATION',
      'ANDROID_WEB_VIEW_JAVASCRIPT_INTERFACE',
    ],
    text: 'Keep app data private to the app and expose nothing to other apps or web content without a check.',
  },
  {
    patterns: ['STRUTS_FORM_VALIDATION'],
    text: 'Extend ValidatorForm and implement validate(ActionMapping, HttpServletRequest) to check every field.',
  },
  {
    patterns: ['SCALA_SENSITIVE_DATA_EXPOSURE'],
    text: 'Do not put configuration values in the response, and never let input choose which key is read.',
  },
  {
    patterns: ['ANDROID_WEB_VIEW_JAVASCRIPT'],
    text: 'Leave JavaScript off in the WebView, or load only your own pages and escape every value they show.',
  },
  {
    patterns: ['JSP_INCLUDE'],
    text: 'Include a fixed page name; choose between pages with an if on an allow-list, never a request value.',
  },
  {
    patterns: ['ESAPI_ENCRYPTOR'],
    text: 'Use ESAPI 2.1.0 or later, with an authenticated mode (GCM, or CBC with a MAC) and AES keys of 128 bits or more.',
  },
];
