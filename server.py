import os

from flask import Flask, send_from_directory, render_template, request
app = Flask(__name__, static_url_path='')




@app.route('/')
def root():
#     return app.send_static_file('main.html')
    return render_template('main.html')


@app.route('/js/<path:path>')
def send_js(path):
    print(path)
    return send_from_directory('js', path)
#     return app.send_static_file(path)


if __name__ == "__main__":
    app.run()
