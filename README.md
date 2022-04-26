# 浅说原理

首先，我们建立了三个文件
    //add.js
    exports.default = function(a, b) {
        return  a + b
    }

    //index.js
    var add = require('./add.js').default
    console.log(add(2, 4))

    //index.html
    <script src="./src/index.js"></script>

我们希望的结果是将上面两个js文件打包成一个bundle.js文件，在浏览器端正常运行

我们先直接在浏览器运行这个程序，发现他会报错，主要问题是他没有exports和require

## 模拟exports
    var exports = {};

    //创建一个立即执行函数防止污染全局变量
    (function (exports, code) {
        eval(code)
    })(exports, "exports.default = function (a, b) {return a + b}")


## 模拟require的固定模块
    function require(file) {
        var exports = {};
        //创建一个立即执行函数防止污染全局变量
        (function (exports, code) {
            eval(code)
        })(exports, "exports.default = function (a, b) {return a + b}")

        return exports
    }

    var add = require("./add.js").default
    console.log(add(2, 4));

## 对require进行完善
    (function (list) {
        function require(file) {
            var exports = {};
            //创建一个立即执行函数防止污染全局变量
            (function (exports, code) {
                eval(code)
            })(exports, list[file])

            return exports
        }
        //入口
        require('index.js')
    })({
        "add.js": `exports.default = function (a, b) {return a + b}`,
        "index.js": `var add = require("add.js").default
                    console.log(add(2, 4));`
    })

## 准备总结
真正的webpack生成的bundle.js文件还需要增加模块间的依赖关系，类似于
    {
        "./src/index.js": {
            "deps": { "./add.js": "./src/add.js" },
            "code": "....."
        },
        "./src/add.js": {
            "deps": {},
            "code": "......"
        }
    }

webpack打包分为以下三个阶段：分析依赖、ES6转ES5、替换require与exports

# 功能实现

## 安装依赖
    @babel/parser @babel/traverse @babel/core @babel/preset-env

## AST与模块分析
创建一个webpack.js文件
    const fs = require('fs')
    const path = require('path')
    const parser = require('@babel/parser')
    const traverse = require('@babel/traverse').default
    const babel = require('@babel/core')



    function getMoudleInfo(file) {
        //读取文件
        const body = fs.readFileSync(file, 'utf-8')
        //有哪些import项
        //转换AST语法树 str => 对象 => 对象遍历解析
        //编译过程
        const ast = parser.parse(body, {
            sourceType: 'module'
        })

        const deps = {}

        //遍历AST语法树
        traverse(ast, {
            ImportDeclaration({node}) {
                //遇到import节点的时候
                // console.log('import', node);
                const dirname = path.dirname(file)
                const abspath = './' + path.join(dirname, node.source.value)
                // console.log(abspath);
                deps[node.source.value] = abspath

            },
        })


        //ES6转换为es5
        const {code} = babel.transformFromAst(ast, null, {
            presets: ['@babel/preset-env']
        })


        const moduleInfo = {file, deps, code}
        return moduleInfo
    }

    const info = getMoudleInfo('./src/index.js')
    console.log(info);

## 收集依赖
    //解析模块
    function parseModules(file) {
        const entry = getMoudleInfo(file)
        const temp = [entry]
        const depsGraph = {}


        getDeps(temp, entry)

        //利用temp函数去构造依赖图
        temp.forEach(info => {
            depsGraph[info.file] = {
                deps: info.deps,
                code: info.code
            }
        })
        return depsGraph


    }

    //用于获取依赖
    function getDeps(temp, {deps}) {
        Object.keys(deps).forEach(key => {
            const child = getMoudleInfo(deps[key])
            temp.push(child)
            getDeps(temp, child)
        })
    }

## 生成bundle文件
    //生成bundle文件
    function bundle(file) {
        const depsGraph = JSON.stringify(parseModules(file))
        return `(function (graph) {
            function require(file) {
                function absRequire(relPath) {
                    return require(graph[file].deps[relPath])
                }
                var exports = {};
                (function (require,exports,code) {
                    eval(code)
                })(absRequire,exports,graph[file].code)
                return exports
            }
            require('${file}')
        })(${depsGraph})`;
    }

    const content = bundle('./src/index.js')

    !fs.existsSync('./dist') && fs.mkdirSync('./dist')
    fs.writeFileSync('./dist/bundle.js', content)