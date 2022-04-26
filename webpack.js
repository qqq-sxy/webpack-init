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

// const info = getMoudleInfo('./src/index.js')
// console.log(info);


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


// const content = parseModules('./src/index.js')
// console.log('content', content);


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