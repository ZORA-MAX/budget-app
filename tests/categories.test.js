import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TAG_MAP,
  addCategory,
  renameCategory,
  addSubcategory,
  renameSubcategory,
  addTag,
  renameTag,
  getCategoryByKey,
} from '../src/lib/categories.js'

test('adds and renames user-defined categories and subcategories', () => {
  const category = addCategory('测试一级分类')
  assert.equal(getCategoryByKey(category.key).label, '测试一级分类')

  renameCategory(category.key, '测试分类已修改')
  assert.equal(getCategoryByKey(category.key).label, '测试分类已修改')

  const subcategory = addSubcategory(category.key, '测试子分类')
  assert.equal(getCategoryByKey(category.key).subs.at(-1).key, subcategory.key)

  renameSubcategory(category.key, subcategory.key, '测试子分类已修改')
  assert.equal(getCategoryByKey(category.key).subs.at(-1).label, '测试子分类已修改')
})

test('adds and renames user-defined spending traits', () => {
  const tag = addTag('测试消费性质')
  assert.equal(TAG_MAP[tag.key].label, '测试消费性质')

  renameTag(tag.key, '测试性质已修改')
  assert.equal(TAG_MAP[tag.key].label, '测试性质已修改')
})
