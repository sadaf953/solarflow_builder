import template from '../template/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
export default {
    // Same look as the client app; also scans the template code the builder imports.
    presets: [template],
    content: {
        relative: true,
        files: [
            './index.html',
            './src/**/*.{js,jsx}',
            '../template/src/ui/**/*.{js,jsx}',
            '../template/src/lib/**/*.{js,jsx}',
            '../template/src/constants.js',
        ],
    },
}
